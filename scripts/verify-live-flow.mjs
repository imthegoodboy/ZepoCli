#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { sanitizedChildEnv } from "./env-utils.mjs";
import {
  adjustLiveReportRequestsForConfirmedSession,
  buildLiveCommandLaunchFailureStep,
  buildLiveCommandTimeoutOrErrorStep,
  buildLiveReportStep,
  createLiveConsoleTextRedactor,
  hasLiveReportAddressDetailText,
  hasLiveReportMissingCoverage,
  LIVE_REPORT_NOTE,
  redactArgsForLiveConsole,
  redactLiveConsoleText,
  summarizeLiveReportAttempts,
  summarizeLiveReportCoverage,
  summarizeLiveReportMissingCoverage,
  summarizeLiveReportRequests,
  summarizeLiveRunnerFailure
} from "./live-report-utils.mjs";

const rootDir = resolve(import.meta.dirname, "..");
const cliPath = resolve(rootDir, "dist", "index.js");
const packageJson = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf8"));
const DEFAULT_STEP_TIMEOUT_MS = 30 * 60 * 1_000;
const MIN_STEP_TIMEOUT_MS = 1_000;
const MAX_STEP_TIMEOUT_MS = 60 * 60 * 1_000;
const COMMAND_TIMEOUT_FORCE_KILL_GRACE_MS = 30_000;
const LIVE_STATUS_MAX_ATTEMPTS = 3;
const LIVE_STATUS_RETRY_DELAY_MS = 5_000;
const INTERRUPT_EXIT_CODES = {
  SIGINT: 130,
  SIGTERM: 143
};

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  printHelp();
  process.exit(0);
}

validateOptions(options);

if (!options.dataDir) {
  console.error("Missing required --data-dir <path>.");
  console.error(
    "Use a dedicated persistent data directory, for example: npm --silent run verify:live -- --data-dir ./.zepo-live --login"
  );
  process.exit(1);
}

if (!existsSync(cliPath)) {
  console.error("Compiled CLI was not found at dist/index.js. Run `npm run build` before `npm run verify:live`.");
  process.exit(1);
}

const reportPath = options.report ?? resolve(options.dataDir, "live-verification-report.json");
const requestedCoverage = summarizeLiveReportRequests(options);
const initialCoverage = summarizeLiveReportCoverage([]);
const report = {
  ok: true,
  version: packageJson.version,
  generatedAt: new Date().toISOString(),
  dataDir: "<redacted-data-dir>",
  reportPath: "<redacted-report-path>",
  note: LIVE_REPORT_NOTE,
  requested: requestedCoverage,
  attempted: summarizeLiveReportAttempts([]),
  coverage: initialCoverage,
  missingCoverage: summarizeLiveReportMissingCoverage(requestedCoverage, initialCoverage),
  steps: []
};
let activeChild;
let interrupted = false;

process.once("SIGINT", () => handleInterrupt("SIGINT"));
process.once("SIGTERM", () => handleInterrupt("SIGTERM"));

try {
  await main();
} catch (error) {
  report.ok = false;
  report.steps.push({
    name: "live runner",
    command: "internal",
    exitCode: 1,
    ok: false,
    error: summarizeLiveRunnerFailure(error)
  });
  console.error("Live verification runner failed before completing all requested steps.");
}

updateReportCoverage();
const reportWriteError = writeLiveReport(reportPath, report);
console.log("\nLive verification report: <redacted-report-path>");
if (reportWriteError) {
  console.error("Could not write live verification report.");
  console.error("Choose a writable report file path and rerun with --report <path>.");
  process.exitCode = 1;
} else {
  process.exitCode = report.ok ? 0 : 1;
}

async function main() {
  console.log("ZepoCli live verification runner");
  console.log("This runs real CLI commands against Zepto with a human-controlled browser when needed.");
  console.log("It never enters OTPs, payment credentials, or clicks final Zepto payment/order controls.\n");

  const preflightArgs = baseCliArgs({ visible: shouldUseVisiblePreflight() });
  if (!(await runStep("doctor", [...preflightArgs, "doctor", "--json"])).ok) {
    return;
  }

  const status = await runStep("status", [...preflightArgs, "status", "--json"]);
  if (!status.ok) {
    return;
  }
  report.requested = adjustLiveReportRequestsForConfirmedSession(report.requested, status.payload);

  if (status.payload?.confirmedSession !== true) {
    if (!options.login) {
      addManualFailure(
        "session precondition",
        "No confirmed Zepto session is available.",
        "Rerun with --login so a human can complete Zepto login/OTP in the visible browser."
      );
      return;
    }

    const loginArgs = [...baseCliArgs({ visible: true }), "login", "--json"];
    if (options.phone) {
      loginArgs.splice(loginArgs.length - 1, 0, "--phone", options.phone);
    }
    if (!(await runStep("login", loginArgs)).ok) {
      return;
    }
  }

  if (report.requested.liveSession !== true) {
    return;
  }

  const liveStatus = await runLiveStatusStep();

  if (!liveStatus.ok) {
    return;
  }

  if (liveStatus.payload?.liveSession?.state !== "logged-in") {
    addManualFailure(
      "live session",
      "Zepto live session was not verified as logged-in.",
      "Run `zepo status --live --visible --json` or `zepo --visible login` before cart, address, checkout, or order verification."
    );
    return;
  }

  if (options.addressAdd) {
    if (!(await runStep("address add", [...baseCliArgs({ visible: true }), "address", "add", "--json"])).ok) {
      return;
    }
  }

  if (options.address) {
    if (!(await runStep("address use", [
      ...baseCliArgs({ visible: true }),
      "address",
      "use",
      options.address,
      "--json"
    ])).ok) {
      return;
    }
  } else if (options.addressList) {
    if (!(await runStep("address list", [...baseCliArgs({ visible: true }), "address", "list", "--json"])).ok) {
      return;
    }
  }

  if (options.search) {
    if (!(await runStep("search", [...baseCliArgs({ visible: true }), "search", options.search, "--json"])).ok) {
      return;
    }
  }

  if (options.add) {
    const addArgs = [
      ...baseCliArgs({ visible: true }),
      "add",
      options.add,
      "--quantity",
      String(options.quantity),
      "--json"
    ];
    if (options.addRemoveLimitItems) {
      addArgs.splice(addArgs.length - 1, 0, "--remove-limit-items");
    }
    if (options.chooseAdd) {
      addArgs.splice(addArgs.length - 1, 0, "--choose");
    }

    if (!(await runStep("add", addArgs)).ok) {
      return;
    }
  }

  if (options.reorderLast) {
    console.error(
      "\nReorder verification clicks Zepto's explicit reorder/order-again control for the latest readable order and may add those items back to the cart. Review the visible browser before checkout."
    );
    if (!(await runStep("reorder", [...baseCliArgs({ visible: true }), "reorder", "last", "--json"])).ok) {
      return;
    }
  }

  if (options.remove) {
    console.error(
      "\nRemove verification changes the Zepto cart by clicking a matching removable item row. Review the visible browser before checkout."
    );
    if (!(await runStep("remove", [...baseCliArgs({ visible: true }), "remove", options.remove, "--json"])).ok) {
      return;
    }
  }

  if (options.clear) {
    console.error(
      "\nClear verification removes all detected Zepto cart items. Run it only when this test cart can be emptied."
    );
    if (!(await runStep("clear", [...baseCliArgs({ visible: true }), "clear", "--json"])).ok) {
      return;
    }
  }

  if (options.cart || options.add || options.reorderLast || options.remove || options.clear) {
    const cartArgs = [...baseCliArgs({ visible: true }), "cart", "--json"];
    if (options.cartRemoveLimitItems) {
      cartArgs.splice(cartArgs.length - 1, 0, "--remove-limit-items");
    }
    if (!(await runStep("cart", cartArgs)).ok) {
      return;
    }
  }

  if (options.checkout) {
    console.error(
      "\nCheckout verification opens Zepto checkout/payment in a visible browser. Complete only the Zepto-side actions you choose; ZepoCli will not click final payment or order-placement controls."
    );
    const checkoutArgs = [...baseCliArgs({ visible: true }), "checkout", "--json"];
    if (options.checkoutRemoveLimitItems) {
      checkoutArgs.splice(checkoutArgs.length - 1, 0, "--remove-limit-items");
    }
    if (options.checkoutWait) {
      checkoutArgs.splice(checkoutArgs.length - 1, 0, "--wait");
    }
    const checkoutResult = await runStep("checkout", checkoutArgs);
    if (!checkoutResult.ok && !shouldContinueAfterManualCheckout(checkoutResult)) {
      if (options.productionScope && isManualCheckoutContinuation(checkoutResult)) {
        console.error(
          "\nProduction-scope verification stops before tracking because checkout handoff coverage is missing."
        );
      }
      return;
    }
    if (!checkoutResult.ok) {
      console.error(
        "\nCheckout stopped at Zepto's manual payment-control boundary; continuing to track because --checkout-wait was requested."
      );
    }
  }

  if (options.track) {
    if (!(await runStep("track", [...baseCliArgs({ visible: true }), "track", "--json"])).ok) {
      return;
    }
  }

  if (options.history) {
    await runStep("history", [...baseCliArgs({ visible: true }), "history", "--json"]);
  }
}

function shouldUseVisiblePreflight() {
  return report.requested.liveSession === true;
}

function baseCliArgs({ visible = false } = {}) {
  const args = ["--data-dir", options.dataDir];
  if (options.browserLocale) {
    args.push("--browser-locale", options.browserLocale);
  }
  if (options.browserTimezone) {
    args.push("--browser-timezone", options.browserTimezone);
  }
  if (visible) {
    args.push("--visible");
  }

  return args;
}

async function runStep(name, args) {
  console.log(`> zepo ${redactArgsForLiveConsole(args).join(" ")}`);
  let result;
  try {
    result = await runCli(args);
  } catch (error) {
    const step =
      isLiveCommandTimeoutError(error) && Number.isFinite(error.timeoutMs)
        ? buildLiveCommandTimeoutOrErrorStep({
            name,
            args,
            timeoutMs: error.timeoutMs,
            stdout: error.stdout,
            stderr: error.stderr,
            summarizePayload
          })
        : buildLiveCommandLaunchFailureStep(name, args, error);
    report.ok = false;
    report.steps.push(step);
    console.log(`fail ${name}`);
    return step;
  }
  const { step, payload } = buildLiveReportStep({
    name,
    args,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    summarizePayload
  });
  report.steps.push(step);

  if (step.ok) {
    console.log(`pass ${name}`);
  } else {
    report.ok = false;
    console.log(`fail ${name}`);
  }

  return {
    ...step,
    payload
  };
}

async function runLiveStatusStep() {
  const args = [...baseCliArgs({ visible: true }), "status", "--live", "--json"];
  for (let attempt = 1; attempt <= LIVE_STATUS_MAX_ATTEMPTS; attempt += 1) {
    const result = await runStep("status live", args);
    if (result.ok || !isRetryableUnknownLiveStatus(result) || attempt === LIVE_STATUS_MAX_ATTEMPTS) {
      return result;
    }

    removeLastReportStep("status live");
    console.error(
      `Live session check was ambiguous; retrying ${attempt + 1}/${LIVE_STATUS_MAX_ATTEMPTS} after ${LIVE_STATUS_RETRY_DELAY_MS} ms.`
    );
    await delay(LIVE_STATUS_RETRY_DELAY_MS);
  }
}

function isRetryableUnknownLiveStatus(result) {
  return (
    result?.payload?.confirmedSession === true &&
    result?.payload?.browserAutomation?.ready === true &&
    result?.payload?.liveSession?.checked === true &&
    result?.payload?.liveSession?.state === "unknown" &&
    result?.payload?.accessChallenge?.cooldownActive !== true
  );
}

function isManualCheckoutContinuation(result) {
  return (
    result?.name === "checkout" &&
    result?.ok === false &&
    result?.error?.code === "live_verification_incomplete" &&
    result?.payload?.status === "checkout_manual_action_required"
  );
}

function shouldContinueAfterManualCheckout(result) {
  return (
    options.checkoutWait &&
    options.track &&
    !options.productionScope &&
    isManualCheckoutContinuation(result)
  );
}

function removeLastReportStep(name) {
  const last = report.steps.at(-1);
  if (last?.name === name) {
    report.steps.pop();
    report.ok = report.steps.every((step) => step.ok === true);
  }
}

function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function runCli(args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: rootDir,
      env: sanitizedChildEnv(process.env, {
        FORCE_COLOR: "0",
        NO_COLOR: "1"
      }),
      stdio: ["inherit", "pipe", "pipe"]
    });
    activeChild = child;

    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let forceKill;
    const stderrRedactor = createLiveConsoleTextRedactor(args, (text) => process.stderr.write(text), {
      immediate: shouldStreamLiveStderrImmediately(args)
    });
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }

      timedOut = true;
      child.kill("SIGTERM");
      forceKill = setTimeout(() => child.kill("SIGKILL"), COMMAND_TIMEOUT_FORCE_KILL_GRACE_MS);
    }, options.stepTimeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      stderrRedactor.write(chunk);
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }

      clearTimeout(timeout);
      clearForceKillTimer(forceKill);
      settled = true;
      clearActiveChild(child);
      stderrRedactor.flush();
      reject(timedOut ? liveCommandTimeoutError(options.stepTimeoutMs, { stdout, stderr }) : error);
    });
    child.on("close", (status) => {
      if (settled) {
        return;
      }

      clearTimeout(timeout);
      clearForceKillTimer(forceKill);
      settled = true;
      clearActiveChild(child);
      stderrRedactor.flush();
      if (timedOut) {
        reject(liveCommandTimeoutError(options.stepTimeoutMs, { stdout, stderr }));
        return;
      }

      resolvePromise({
        status: status ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });
  });
}

function shouldStreamLiveStderrImmediately(args) {
  const positionals = collectLiveCommandPositionals(args);
  const command = positionals[0];

  return (
    command === "login" ||
    command === "checkout" ||
    (command === "address" && positionals[1] === "add") ||
    (command === "add" && args.includes("--choose"))
  );
}

function collectLiveCommandPositionals(args) {
  const valueOptions = new Set([
    "--browser-locale",
    "--browser-timezone",
    "--data-dir",
    "--phone",
    "--quantity",
    "--report",
    "--timeout"
  ]);
  const positionals = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (valueOptions.has(arg)) {
      index += 1;
      continue;
    }

    if (arg.startsWith("-")) {
      continue;
    }

    positionals.push(arg);
  }

  return positionals;
}

function handleInterrupt(signal) {
  if (interrupted) {
    return;
  }
  interrupted = true;

  const exitCode = INTERRUPT_EXIT_CODES[signal] ?? 1;
  report.ok = false;
  report.steps.push({
    name: "live runner",
    command: "internal",
    exitCode,
    ok: false,
    error: {
      code: "live_runner_failed",
      message: "Live verification interrupted by the user.",
      hint: "Review the visible Zepto browser state, then rerun verify:live when ready."
    }
  });

  const child = activeChild;
  if (child && child.exitCode === null && child.signalCode === null) {
    const forceKill = setTimeout(() => child.kill("SIGKILL"), COMMAND_TIMEOUT_FORCE_KILL_GRACE_MS);
    child.once("close", () => {
      clearForceKillTimer(forceKill);
      finishInterruptedRun(signal, exitCode);
    });
    child.kill("SIGTERM");
    return;
  }

  finishInterruptedRun(signal, exitCode);
}

function finishInterruptedRun(signal, exitCode) {
  updateReportCoverage();
  const reportWriteError = writeLiveReport(reportPath, report);
  console.error(`Live verification interrupted by ${signal}.`);
  console.log("\nLive verification report: <redacted-report-path>");
  if (reportWriteError) {
    console.error("Could not write live verification report.");
    console.error("Choose a writable report file path and rerun with --report <path>.");
  }
  process.exit(exitCode);
}

function updateReportCoverage() {
  report.attempted = summarizeLiveReportAttempts(report.steps);
  report.coverage = summarizeLiveReportCoverage(report.steps);
  report.missingCoverage = summarizeLiveReportMissingCoverage(report.requested, report.coverage);
  if (hasLiveReportMissingCoverage(report.missingCoverage)) {
    report.ok = false;
  }
}

function clearActiveChild(child) {
  if (activeChild === child) {
    activeChild = undefined;
  }
}

function clearForceKillTimer(timer) {
  if (timer) {
    clearTimeout(timer);
  }
}

function liveCommandTimeoutError(timeoutMs, output = {}) {
  const error = new Error(`Command timed out after ${timeoutMs} ms.`);
  error.code = "live_command_timeout";
  error.timeoutMs = timeoutMs;
  error.stdout = String(output.stdout ?? "").trim();
  error.stderr = String(output.stderr ?? "").trim();
  return error;
}

function isLiveCommandTimeoutError(error) {
  return typeof error === "object" && error !== null && error.code === "live_command_timeout";
}

function writeLiveReport(path, payload) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`);
    return undefined;
  } catch (error) {
    return error;
  }
}

function addManualFailure(name, message, hint) {
  report.ok = false;
  report.steps.push({
    name,
    command: "manual",
    exitCode: 1,
    ok: false,
    error: {
      code: "live_verification_incomplete",
      message,
      hint
    }
  });
  console.log(`fail ${name}`);
  console.log(hint);
}

function summarizePayload(name, payload) {
  if (name === "doctor") {
    const checks = Array.isArray(payload.checks) ? payload.checks : [];
    const playwrightChromiumCheck = checks.find((check) => check.name === "Playwright Chromium");
    return {
      ok: payload.ok === true,
      browserAutomationReady: payload.browserAutomation?.ready === true,
      playwrightChromiumPassed: playwrightChromiumCheck?.status === "pass",
      warnings: checks.filter((check) => check.status === "warn").map((check) => check.name),
      failures: checks.filter((check) => check.status === "fail").map((check) => check.name)
    };
  }

  if (name === "status" || name === "status live") {
    return {
      confirmedSession: payload.confirmedSession === true,
      browserAutomationReady: payload.browserAutomation?.ready === true,
      liveSessionState: payload.liveSession?.state ?? "skipped"
    };
  }

  if (name === "login") {
    return {
      sessionSaved: payload.sessionSaved === true,
      confirmedSession: payload.confirmedSession === true
    };
  }

  if (name === "search") {
    return {
      productCount: readableProductCount(payload),
      productDetailCount: detailedProductCount(payload)
    };
  }

  if (name === "address add" || name === "address list") {
    const addresses = Array.isArray(payload) ? payload : [];
    const addressCount = readableAddressCount(addresses);
    return {
      addressCount,
      selectedCount: readableSelectedAddressCount(addresses),
      hasAddressDetail: addressCount > 0
    };
  }

  if (name === "address use") {
    return {
      selected: payload.selected === true,
      hasAddressText: typeof payload.text === "string" && payload.text.trim().length > 0,
      hasAddressDetail: hasLiveReportAddressDetailText(payload.text)
    };
  }

  if (name === "add") {
    return {
      productAdded: hasReadableRecordName(payload.product),
      productHasDetail: hasReadableProductDetail(payload.product),
      cartItemCount: readableCartItemCount(payload.cart)
    };
  }

  if (name === "remove") {
    return {
      removedItemCount: detailedCartItemCount(payload.removedItems),
      removedHasDetail: detailedCartItemCount(payload.removedItems) > 0,
      cartItemCount: readableCartItemCount(payload.cart),
      hasTotal: typeof payload.cart?.total === "string"
    };
  }

  if (name === "cart" || name === "reorder" || name === "clear") {
    return {
      cartItemCount: readableCartItemCount(payload),
      hasTotal: typeof payload.total === "string"
    };
  }

  if (name === "checkout") {
    return {
      status: payload.status,
      humanActionRequired: payload.humanActionRequired,
      automationBoundary: payload.automationBoundary,
      handoffUrl: payload.handoffUrl,
      handoffSurface: payload.handoffSurface,
      browserOpenAfterReturn: payload.browserOpenAfterReturn,
      checkoutWaitCompleted: payload.checkoutWaitCompleted,
      manualPaymentControlVisible: payload.manualPaymentControlVisible,
      checkoutCartItemCount: checkoutCartEvidenceItemCount(payload),
      checkoutHasPayableTotal: checkoutCartEvidenceHasPayableTotal(payload),
      cartPrecondition: payload.cartPrecondition,
      paymentStatus: payload.paymentStatus,
      orderPlacement: payload.orderPlacement,
      orderStatusCommand: payload.orderStatusCommand
    };
  }

  if (name === "track" || name === "history") {
    const orders = Array.isArray(payload) ? payload : [];
    return {
      orderCount: readableOrderCount(orders),
      latestHasStatus: hasReadableText(orders[0]?.status),
      latestHasEta: hasReadableText(orders[0]?.eta)
    };
  }

  return {
    observed: true
  };
}

function readableProductCount(payload) {
  return Array.isArray(payload) ? payload.filter(hasReadableRecordName).length : 0;
}

function detailedProductCount(payload) {
  return Array.isArray(payload) ? payload.filter(hasReadableProductDetail).length : 0;
}

function readableAddressCount(payload) {
  return Array.isArray(payload) ? payload.filter(hasReadableAddressDetail).length : 0;
}

function readableSelectedAddressCount(payload) {
  return Array.isArray(payload)
    ? payload.filter((address) => address?.selected === true && hasReadableAddressDetail(address)).length
    : 0;
}

function readableCartItemCount(payload) {
  return Array.isArray(payload?.items) ? payload.items.filter(hasReadableRecordName).length : 0;
}

function detailedCartItemCount(payload) {
  return Array.isArray(payload)
    ? payload.filter((item) => hasReadableRecordName(item) && (hasReadableText(item?.price) || hasReadableText(item?.unit))).length
    : 0;
}

function checkoutCartEvidenceItemCount(payload) {
  const count = payload?.cartEvidence?.itemCount;
  return Number.isInteger(count) && count >= 0 && count <= 200 ? count : 0;
}

function checkoutCartEvidenceHasPayableTotal(payload) {
  return payload?.cartEvidence?.hasPayableTotal === true;
}

function readableOrderCount(orders) {
  return orders.filter((order) => hasReadableText(order?.status) || hasReadableText(order?.eta)).length;
}

function hasReadableRecordName(value) {
  return hasReadableText(value?.name);
}

function hasReadableProductDetail(value) {
  return (
    hasReadableRecordName(value) &&
    (hasReadableText(value?.price) || hasReadableText(value?.unit))
  );
}

function hasReadableAddressDetail(value) {
  return hasLiveReportAddressDetailText(value?.text);
}

function hasReadableText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function parseArgs(args) {
  const parsed = {
    addressAdd: false,
    addressList: false,
    addRemoveLimitItems: false,
    cart: false,
    cartRemoveLimitItems: false,
    checkout: false,
    checkoutRemoveLimitItems: false,
    checkoutWait: false,
    help: false,
    history: false,
    login: false,
    productionScope: false,
    quantity: 1,
    reorderLast: false,
    clear: false,
    chooseAdd: false,
    stepTimeoutMs: DEFAULT_STEP_TIMEOUT_MS,
    track: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (matchesValueOption(arg, "--data-dir")) {
      const parsedValue = readValueOption(args, index, "--data-dir");
      parsed.dataDir = parsedValue.value;
      index = parsedValue.index;
    } else if (matchesValueOption(arg, "--report")) {
      const parsedValue = readValueOption(args, index, "--report");
      parsed.report = parsedValue.value;
      index = parsedValue.index;
    } else if (matchesValueOption(arg, "--browser-locale")) {
      const parsedValue = readValueOption(args, index, "--browser-locale");
      parsed.browserLocale = parseBrowserLocale(parsedValue.value);
      index = parsedValue.index;
    } else if (matchesValueOption(arg, "--browser-timezone")) {
      const parsedValue = readValueOption(args, index, "--browser-timezone");
      parsed.browserTimezone = parseBrowserTimezone(parsedValue.value);
      index = parsedValue.index;
    } else if (matchesValueOption(arg, "--step-timeout")) {
      const parsedValue = readValueOption(args, index, "--step-timeout");
      parsed.stepTimeoutMs = parseStepTimeout(parsedValue.value);
      index = parsedValue.index;
    } else if (arg === "--login") {
      parsed.login = true;
    } else if (arg === "--production-scope") {
      parsed.productionScope = true;
    } else if (matchesValueOption(arg, "--phone")) {
      const parsedValue = readValueOption(args, index, "--phone");
      parsed.phone = normalizeLoginPhone(parsedValue.value);
      index = parsedValue.index;
    } else if (matchesValueOption(arg, "--search")) {
      const parsedValue = readValueOption(args, index, "--search");
      parsed.search = parsedValue.value;
      index = parsedValue.index;
    } else if (matchesValueOption(arg, "--address")) {
      const parsedValue = readValueOption(args, index, "--address");
      parsed.address = parsedValue.value;
      index = parsedValue.index;
    } else if (arg === "--address-add") {
      parsed.addressAdd = true;
    } else if (arg === "--address-list") {
      parsed.addressList = true;
    } else if (matchesValueOption(arg, "--add")) {
      const parsedValue = readValueOption(args, index, "--add");
      parsed.add = parsedValue.value;
      index = parsedValue.index;
    } else if (arg === "--add-remove-limit-items") {
      parsed.addRemoveLimitItems = true;
    } else if (arg === "--choose-add") {
      parsed.chooseAdd = true;
    } else if (matchesValueOption(arg, "--quantity")) {
      const parsedValue = readValueOption(args, index, "--quantity");
      parsed.quantity = parseQuantity(parsedValue.value);
      index = parsedValue.index;
    } else if (arg === "--cart") {
      parsed.cart = true;
    } else if (arg === "--cart-remove-limit-items") {
      parsed.cartRemoveLimitItems = true;
    } else if (matchesValueOption(arg, "--remove")) {
      const parsedValue = readValueOption(args, index, "--remove");
      parsed.remove = parsedValue.value;
      index = parsedValue.index;
    } else if (arg === "--clear") {
      parsed.clear = true;
    } else if (arg === "--checkout") {
      parsed.checkout = true;
    } else if (arg === "--checkout-remove-limit-items") {
      parsed.checkoutRemoveLimitItems = true;
    } else if (arg === "--checkout-wait") {
      parsed.checkoutWait = true;
    } else if (arg === "--track") {
      parsed.track = true;
    } else if (arg === "--history") {
      parsed.history = true;
    } else if (arg === "--reorder-last") {
      parsed.reorderLast = true;
    } else {
      failUnknownArgument(arg);
    }
  }

  applyProductionScopeDefaults(parsed);
  return parsed;
}

function applyProductionScopeDefaults(parsed) {
  if (!parsed.productionScope) {
    return;
  }

  parsed.cart = true;
  parsed.checkout = true;
  parsed.checkoutWait = true;
  parsed.track = true;
}

function failUnknownArgument(arg) {
  const option = formatUnknownOptionName(arg);
  if (option) {
    console.error(`Unknown option: ${option}.`);
  } else {
    console.error("Unexpected positional argument.");
  }

  if (String(arg ?? "").includes("=")) {
    console.error("Check the option name; supported value options accept both --option value and --option=value.");
  }
  console.error("Run `npm --silent run verify:live -- --help` for supported options.");
  process.exit(1);
}

function matchesValueOption(arg, option) {
  return arg === option || String(arg ?? "").startsWith(`${option}=`);
}

function readValueOption(args, index, option) {
  const arg = args[index];
  if (arg === option) {
    return {
      value: requireValue(args, index + 1, option),
      index: index + 1
    };
  }

  const assignmentPrefix = `${option}=`;
  if (String(arg ?? "").startsWith(assignmentPrefix)) {
    const value = String(arg).slice(assignmentPrefix.length);
    if (value.trim().length === 0) {
      console.error(`${option} requires a non-empty value.`);
      process.exit(1);
    }

    return {
      value,
      index
    };
  }

  failUnknownArgument(arg);
}

function formatUnknownOptionName(arg) {
  const text = String(arg ?? "");
  if (!text.startsWith("-")) {
    return undefined;
  }

  return redactLiveConsoleText(text.split("=", 1)[0]);
}

function requireValue(args, index, option) {
  const value = args[index];
  if (!value || value.startsWith("--")) {
    console.error(`${option} requires a value.`);
    process.exit(1);
  }

  if (value.trim().length === 0) {
    console.error(`${option} requires a non-empty value.`);
    process.exit(1);
  }

  return value;
}

function parseStepTimeout(value) {
  if (!/^\d+$/.test(value)) {
    console.error(`--step-timeout must be an integer from ${MIN_STEP_TIMEOUT_MS} to ${MAX_STEP_TIMEOUT_MS} ms.`);
    process.exit(1);
  }

  const timeoutMs = Number.parseInt(value, 10);
  if (!Number.isInteger(timeoutMs) || timeoutMs < MIN_STEP_TIMEOUT_MS || timeoutMs > MAX_STEP_TIMEOUT_MS) {
    console.error(`--step-timeout must be an integer from ${MIN_STEP_TIMEOUT_MS} to ${MAX_STEP_TIMEOUT_MS} ms.`);
    process.exit(1);
  }

  return timeoutMs;
}

function parseQuantity(value) {
  if (!/^\d+$/.test(value)) {
    console.error("--quantity must be an integer from 1 to 12.");
    process.exit(1);
  }

  const quantity = Number.parseInt(value, 10);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 12) {
    console.error("--quantity must be an integer from 1 to 12.");
    process.exit(1);
  }

  return quantity;
}

function parseBrowserLocale(value) {
  try {
    return Intl.getCanonicalLocales(value)[0];
  } catch {
    console.error("--browser-locale must be a valid BCP 47 locale.");
    process.exit(1);
  }
}

function parseBrowserTimezone(value) {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    console.error("--browser-timezone must be a valid IANA time zone.");
    process.exit(1);
  }
}

function normalizeLoginPhone(value) {
  const trimmed = String(value ?? "").trim();
  if (!/^\+?[\d\s-]+$/.test(trimmed)) {
    return undefined;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (/^[6-9]\d{9}$/.test(digits)) {
    return digits;
  }

  if (/^91[6-9]\d{9}$/.test(digits)) {
    return digits.slice(2);
  }

  if (/^0[6-9]\d{9}$/.test(digits)) {
    return digits.slice(1);
  }

  return undefined;
}

function validateOptions(parsed) {
  if (parsed.phone && !parsed.login) {
    console.error("--phone can only be used with --login.");
    process.exit(1);
  }

  if (parsed.phone === undefined && "phone" in parsed) {
    console.error("--phone must be a valid Indian mobile number.");
    process.exit(1);
  }

  if (parsed.quantity !== 1 && !parsed.add) {
    console.error("--quantity can only be used with --add.");
    process.exit(1);
  }

  if (parsed.chooseAdd && !parsed.add) {
    console.error("--choose-add can only be used with --add.");
    process.exit(1);
  }

  if (parsed.addRemoveLimitItems && !parsed.add) {
    console.error("--add-remove-limit-items can only be used with --add.");
    process.exit(1);
  }

  if (parsed.productionScope) {
    validateProductionScopeOptions(parsed);
  }

  if (parsed.checkoutWait && !parsed.checkout) {
    console.error("--checkout-wait can only be used with --checkout or --production-scope.");
    process.exit(1);
  }

  if (parsed.checkoutRemoveLimitItems && !parsed.checkout) {
    console.error("--checkout-remove-limit-items can only be used with --checkout or --production-scope.");
    process.exit(1);
  }

  if (
    parsed.cartRemoveLimitItems &&
    !(parsed.cart || parsed.add || parsed.reorderLast || parsed.remove || parsed.clear)
  ) {
    console.error("--cart-remove-limit-items can only be used when cart evidence is requested.");
    process.exit(1);
  }

  if (parsed.address && parsed.addressList) {
    console.error("--address cannot be combined with --address-list because address selection already verifies the address flow.");
    process.exit(1);
  }

  if (parsed.clear && parsed.checkout) {
    console.error("--clear cannot be combined with --checkout because it empties the cart before checkout verification.");
    console.error("Run clear verification separately, or omit --clear for a checkout handoff run.");
    process.exit(1);
  }
}

function validateProductionScopeOptions(parsed) {
  const missing = [];
  if (!parsed.search) {
    missing.push("--search <query>");
  }
  if (!parsed.address) {
    missing.push("--address <query>");
  }
  if (!parsed.add) {
    missing.push("--add <query>");
  }

  if (missing.length > 0) {
    console.error(`--production-scope requires ${formatList(missing)}.`);
    process.exit(1);
  }

  if (parsed.addressAdd || parsed.addressList || parsed.remove || parsed.clear || parsed.history || parsed.reorderLast) {
    console.error(
      "--production-scope cannot be combined with --address-add, --address-list, --remove, --clear, --history, or --reorder-last."
    );
    console.error("Run those focused live verifications separately so final production-scope evidence stays clear.");
    process.exit(1);
  }
}

function formatList(values) {
  if (values.length <= 1) {
    return values[0] ?? "";
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function printHelp() {
  console.log(`Usage: npm --silent run verify:live -- --data-dir <path> [options]

Runs an opt-in human-controlled live verification sequence against the compiled zepo CLI.

Required:
  --data-dir <path>     Dedicated persistent ZepoCli data directory

Options:
  --login               Run visible zepo login if no confirmed session exists
  --production-scope    Final readiness preset; requires --search, --address, and --add, then verifies non-empty cart with total/payable evidence, checkout handoff, and track with checkout wait enabled
  --phone <number>      Prefill login phone through zepo login --phone; accepts 10-digit, +91, or leading-0 Indian mobile formats
  --browser-locale <locale>
                        Pass a validated browser locale to every child zepo command
  --browser-timezone <timezone>
                        Pass a validated IANA browser time zone to every child zepo command
  --search <query>      Run visible product search
  --address-list        Run visible address list
  --address <query>     Select a saved address by visible text
  --address-add         Open the visible add-address flow
  --add <query>         Add a product to cart
  --add-remove-limit-items
                        During --add cart verification, explicitly click Zepto's Remove Items action for item-limit warnings before reading cart
  --choose-add          Use zepo add --choose for human product selection during --add
  --quantity <number>   Quantity for --add, 1 to 12
  --cart                Read the cart
  --cart-remove-limit-items
                        During cart evidence, explicitly click Zepto's Remove Items action for item-limit warnings before reading cart
  --remove <query>      Remove a matching cart item
  --clear               Remove all detected cart items; cannot be combined with --checkout
  --checkout            Open checkout/payment handoff in a visible Zepto browser
  --checkout-remove-limit-items
                        During --checkout, explicitly click Zepto's Remove Items action for item-limit warnings before checkout
  --checkout-wait       During --checkout, wait for a human Zepto-side checkout/payment action before returning JSON; manual payment controls still do not count as checkout handoff coverage
  --track               Read latest order status
  --history             Read order history
  --reorder-last        Reorder the latest readable order and read the cart
  --report <path>       Write sanitized report to this path
  --step-timeout <ms>   Per-command timeout, ${MIN_STEP_TIMEOUT_MS} to ${MAX_STEP_TIMEOUT_MS} ms (default: ${DEFAULT_STEP_TIMEOUT_MS})

Example:
  npm run build
  npm --silent run verify:live -- --data-dir ./.zepo-live --login --production-scope --search milk --address home --add "Amul Milk 500ml"
  npm --silent run verify:live -- --data-dir ./.zepo-live --login --production-scope --search milk --address home --add "Amul Milk 500ml" --add-remove-limit-items --cart-remove-limit-items --checkout-remove-limit-items

The examples use npm --silent so npm does not echo raw invocation arguments before the runner can redact internal zepo command lines.
If --login is supplied and status already confirms the session, the report requires liveSession coverage instead of a fresh login step.
Use --production-scope for the final production readiness run; it requests browser preflight, local status, live session, address selection, search, add, non-empty cart with total/payable evidence, checkout handoff, and track coverage, with checkout wait enabled so a human can complete Zepto-side checkout/payment before tracking.
Use --add-remove-limit-items only when the visible Zepto add verification step shows item-limit warnings and the human explicitly wants the runner to click Zepto's Remove Items action before reading cart.
Use --cart-remove-limit-items only when the visible Zepto cart evidence step shows item-limit warnings and the human explicitly wants the runner to click Zepto's Remove Items action before reading cart.
Use --checkout-remove-limit-items only when the visible Zepto cart shows item-limit warnings and the human explicitly wants the runner to click Zepto's Remove Items action before checkout.
If checkout remains at checkout_manual_action_required, production-scope verification stops before track because the final report requires checkout handoff coverage first.

For cart cleanup verification, run remove before checkout only when other test cart items remain. Run clear as a separate cleanup pass:
  npm --silent run verify:live -- --data-dir ./.zepo-live --login --add "Amul Milk 500ml" --remove "Amul Milk" --cart
  npm --silent run verify:live -- --data-dir ./.zepo-live --login --clear --cart

The report includes top-level requested, attempted, coverage, and missingCoverage booleans so partial runs cannot be mistaken for full verification.
Manual precondition failures, such as a missing confirmed session, are reported as incomplete manual steps and are not counted as workflow attempts.
The report intentionally omits raw page text, addresses, cart item names, payment credentials, order ids, phone input, local filesystem paths, standalone percent-encoded sensitive fragments, and unredacted workflow query arguments.
It also redacts npm-token-shaped values and standalone percent-encoded sensitive fragments.

Stable report failure codes include live_*_contract_mismatch, live_verification_incomplete, live_runner_failed, live_command_launch_failed, live_command_timeout, live_summary_failed, live_json_unreadable, live_json_unexpected, and command_failed.`);
}
