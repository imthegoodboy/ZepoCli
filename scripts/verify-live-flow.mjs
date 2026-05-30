#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  buildLiveCommandLaunchFailureStep,
  buildLiveCommandTimeoutStep,
  buildLiveReportStep,
  createLiveConsoleTextRedactor,
  redactArgsForLiveConsole,
  summarizeLiveRunnerFailure
} from "./live-report-utils.mjs";

const rootDir = resolve(import.meta.dirname, "..");
const cliPath = resolve(rootDir, "dist", "index.js");
const packageJson = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf8"));
const DEFAULT_STEP_TIMEOUT_MS = 30 * 60 * 1_000;
const MIN_STEP_TIMEOUT_MS = 1_000;
const MAX_STEP_TIMEOUT_MS = 60 * 60 * 1_000;
const COMMAND_TIMEOUT_FORCE_KILL_GRACE_MS = 5_000;
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
  console.error("Use a dedicated persistent data directory, for example: npm run verify:live -- --data-dir ./.zepo-live --login");
  process.exit(1);
}

if (!existsSync(cliPath)) {
  console.error("Compiled CLI was not found at dist/index.js. Run `npm run build` before `npm run verify:live`.");
  process.exit(1);
}

const reportPath = options.report ?? resolve(options.dataDir, "live-verification-report.json");
const report = {
  ok: true,
  version: packageJson.version,
  generatedAt: new Date().toISOString(),
  dataDir: "<redacted-data-dir>",
  reportPath: "<redacted-report-path>",
  note:
    "Sanitized ZepoCli live verification report. It omits raw Zepto page text, addresses, cart item names, payment credentials, order ids, phone input, local filesystem paths, and unredacted workflow query arguments.",
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

  if (!(await runStep("doctor", ["--data-dir", options.dataDir, "doctor", "--json"])).ok) {
    return;
  }

  const status = await runStep("status", ["--data-dir", options.dataDir, "status", "--json"]);
  if (!status.ok) {
    return;
  }

  if (status.payload?.confirmedSession !== true) {
    if (!options.login) {
      addManualFailure(
        "login",
        "No confirmed Zepto session is available.",
        "Rerun with --login so a human can complete Zepto login/OTP in the visible browser."
      );
      return;
    }

    const loginArgs = ["--data-dir", options.dataDir, "--visible", "login", "--json"];
    if (options.phone) {
      loginArgs.splice(loginArgs.length - 1, 0, "--phone", options.phone);
    }
    if (!(await runStep("login", loginArgs)).ok) {
      return;
    }
  }

  const liveStatus = await runStep("status live", [
    "--data-dir",
    options.dataDir,
    "--visible",
    "status",
    "--live",
    "--json"
  ]);

  if (!liveStatus.ok) {
    return;
  }

  if (liveStatus.payload?.liveSession?.state !== "logged-in") {
    addManualFailure(
      "live session",
      "Zepto live session was not verified as logged-in.",
      "Run `zepo status --live --visible --json` or `zepo login` before cart, address, checkout, or order verification."
    );
    return;
  }

  if (options.search) {
    if (!(await runStep("search", ["--data-dir", options.dataDir, "--visible", "search", options.search, "--json"])).ok) {
      return;
    }
  }

  if (options.addressAdd) {
    if (!(await runStep("address add", ["--data-dir", options.dataDir, "--visible", "address", "add", "--json"])).ok) {
      return;
    }
  }

  if (options.address) {
    if (!(await runStep("address use", [
      "--data-dir",
      options.dataDir,
      "--visible",
      "address",
      "use",
      options.address,
      "--json"
    ])).ok) {
      return;
    }
  } else if (options.addressList) {
    if (!(await runStep("address list", ["--data-dir", options.dataDir, "--visible", "address", "list", "--json"])).ok) {
      return;
    }
  }

  if (options.add) {
    const addArgs = [
      "--data-dir",
      options.dataDir,
      "--visible",
      "add",
      options.add,
      "--quantity",
      String(options.quantity),
      "--json"
    ];
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
    if (!(await runStep("reorder", ["--data-dir", options.dataDir, "--visible", "reorder", "last", "--json"])).ok) {
      return;
    }
  }

  if (options.remove) {
    console.error(
      "\nRemove verification changes the Zepto cart by clicking a matching removable item row. Review the visible browser before checkout."
    );
    if (!(await runStep("remove", ["--data-dir", options.dataDir, "--visible", "remove", options.remove, "--json"])).ok) {
      return;
    }
  }

  if (options.clear) {
    console.error(
      "\nClear verification removes all detected Zepto cart items. Run it only when this test cart can be emptied."
    );
    if (!(await runStep("clear", ["--data-dir", options.dataDir, "--visible", "clear", "--json"])).ok) {
      return;
    }
  }

  if (options.cart || options.add || options.reorderLast || options.remove || options.clear) {
    if (!(await runStep("cart", ["--data-dir", options.dataDir, "--visible", "cart", "--json"])).ok) {
      return;
    }
  }

  if (options.checkout) {
    console.error(
      "\nCheckout verification opens Zepto checkout/payment in a visible browser. Complete only the Zepto-side actions you choose; ZepoCli will not click final payment or order-placement controls."
    );
    if (!(await runStep("checkout", ["--data-dir", options.dataDir, "--visible", "checkout", "--json"])).ok) {
      return;
    }
  }

  if (options.track) {
    if (!(await runStep("track", ["--data-dir", options.dataDir, "--visible", "track", "--json"])).ok) {
      return;
    }
  }

  if (options.history) {
    await runStep("history", ["--data-dir", options.dataDir, "--visible", "history", "--json"]);
  }
}

async function runStep(name, args) {
  console.log(`> zepo ${redactArgsForLiveConsole(args).join(" ")}`);
  let result;
  try {
    result = await runCli(args);
  } catch (error) {
    const step =
      isLiveCommandTimeoutError(error) && Number.isFinite(error.timeoutMs)
        ? buildLiveCommandTimeoutStep(name, args, error.timeoutMs)
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

function runCli(args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: rootDir,
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        NO_COLOR: "1"
      },
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
      reject(timedOut ? liveCommandTimeoutError(options.stepTimeoutMs) : error);
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
        reject(liveCommandTimeoutError(options.stepTimeoutMs));
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
  const valueOptions = new Set(["--data-dir", "--phone", "--quantity", "--report", "--timeout"]);
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
  const reportWriteError = writeLiveReport(reportPath, report);
  console.error(`Live verification interrupted by ${signal}.`);
  console.log("\nLive verification report: <redacted-report-path>");
  if (reportWriteError) {
    console.error("Could not write live verification report.");
    console.error("Choose a writable report file path and rerun with --report <path>.");
  }
  process.exit(exitCode);
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

function liveCommandTimeoutError(timeoutMs) {
  const error = new Error(`Command timed out after ${timeoutMs} ms.`);
  error.code = "live_command_timeout";
  error.timeoutMs = timeoutMs;
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
    return {
      ok: payload.ok === true,
      warnings: checks.filter((check) => check.status === "warn").map((check) => check.name),
      failures: checks.filter((check) => check.status === "fail").map((check) => check.name)
    };
  }

  if (name === "status" || name === "status live") {
    return {
      confirmedSession: payload.confirmedSession === true,
      browserAutomationReady: payload.browserAutomation?.ready === true,
      liveSessionState: payload.liveSession?.state
    };
  }

  if (name === "search") {
    return {
      productCount: Array.isArray(payload) ? payload.length : 0
    };
  }

  if (name === "address add" || name === "address list") {
    const addresses = Array.isArray(payload) ? payload : [];
    return {
      addressCount: addresses.length,
      selectedCount: addresses.filter((address) => address.selected === true).length
    };
  }

  if (name === "address use") {
    return {
      selected: payload.selected === true,
      hasAddressText: typeof payload.text === "string" && payload.text.trim().length > 0
    };
  }

  if (name === "add") {
    return {
      productAdded: Boolean(payload.product),
      cartItemCount: Array.isArray(payload.cart?.items) ? payload.cart.items.length : 0
    };
  }

  if (name === "cart" || name === "reorder" || name === "remove" || name === "clear") {
    return {
      cartItemCount: Array.isArray(payload.items) ? payload.items.length : 0,
      hasTotal: typeof payload.total === "string"
    };
  }

  if (name === "checkout") {
    return {
      status: payload.status,
      paymentStatus: payload.paymentStatus,
      orderPlacement: payload.orderPlacement,
      orderStatusCommand: payload.orderStatusCommand
    };
  }

  if (name === "track" || name === "history") {
    const orders = Array.isArray(payload) ? payload : [];
    return {
      orderCount: orders.length,
      latestHasStatus: typeof orders[0]?.status === "string",
      latestHasEta: typeof orders[0]?.eta === "string"
    };
  }

  return {
    observed: true
  };
}

function parseArgs(args) {
  const parsed = {
    addressAdd: false,
    addressList: false,
    cart: false,
    checkout: false,
    help: false,
    history: false,
    login: false,
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
    } else if (arg === "--data-dir") {
      parsed.dataDir = requireValue(args, ++index, arg);
    } else if (arg === "--report") {
      parsed.report = requireValue(args, ++index, arg);
    } else if (arg === "--step-timeout") {
      parsed.stepTimeoutMs = parseStepTimeout(requireValue(args, ++index, arg));
    } else if (arg === "--login") {
      parsed.login = true;
    } else if (arg === "--phone") {
      parsed.phone = normalizeLoginPhone(requireValue(args, ++index, arg));
    } else if (arg === "--search") {
      parsed.search = requireValue(args, ++index, arg);
    } else if (arg === "--address") {
      parsed.address = requireValue(args, ++index, arg);
    } else if (arg === "--address-add") {
      parsed.addressAdd = true;
    } else if (arg === "--address-list") {
      parsed.addressList = true;
    } else if (arg === "--add") {
      parsed.add = requireValue(args, ++index, arg);
    } else if (arg === "--choose-add") {
      parsed.chooseAdd = true;
    } else if (arg === "--quantity") {
      parsed.quantity = parseQuantity(requireValue(args, ++index, arg));
    } else if (arg === "--cart") {
      parsed.cart = true;
    } else if (arg === "--remove") {
      parsed.remove = requireValue(args, ++index, arg);
    } else if (arg === "--clear") {
      parsed.clear = true;
    } else if (arg === "--checkout") {
      parsed.checkout = true;
    } else if (arg === "--track") {
      parsed.track = true;
    } else if (arg === "--history") {
      parsed.history = true;
    } else if (arg === "--reorder-last") {
      parsed.reorderLast = true;
    } else {
      console.error(`Unknown option: ${arg}`);
      process.exit(1);
    }
  }

  return parsed;
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

function printHelp() {
  console.log(`Usage: npm run verify:live -- --data-dir <path> [options]

Runs an opt-in human-controlled live verification sequence against the compiled zepo CLI.

Required:
  --data-dir <path>     Dedicated persistent ZepoCli data directory

Options:
  --login               Run visible zepo login if no confirmed session exists
  --phone <number>      Prefill login phone through zepo login --phone; accepts 10-digit, +91, or leading-0 Indian mobile formats
  --search <query>      Run visible product search
  --address-list        Run visible address list
  --address <query>     Select a saved address by visible text
  --address-add         Open the visible add-address flow
  --add <query>         Add a product to cart
  --choose-add          Use zepo add --choose for human product selection during --add
  --quantity <number>   Quantity for --add, 1 to 12
  --cart                Read the cart
  --remove <query>      Remove a matching cart item
  --clear               Remove all detected cart items; cannot be combined with --checkout
  --checkout            Open checkout/payment handoff in a visible Zepto browser
  --track               Read latest order status
  --history             Read order history
  --reorder-last        Reorder the latest readable order and read the cart
  --report <path>       Write sanitized report to this path
  --step-timeout <ms>   Per-command timeout, ${MIN_STEP_TIMEOUT_MS} to ${MAX_STEP_TIMEOUT_MS} ms (default: ${DEFAULT_STEP_TIMEOUT_MS})

Example:
  npm run build
  npm run verify:live -- --data-dir ./.zepo-live --login --search milk --address home --add "Amul Milk 500ml" --cart --checkout --track

When terminal logs may be shared, prefer npm --silent run verify:live -- ... so npm does not echo raw invocation arguments before the runner can redact internal zepo command lines.

For cart cleanup verification, run remove before checkout only when other test cart items remain. Run clear as a separate cleanup pass:
  npm run verify:live -- --data-dir ./.zepo-live --login --add "Amul Milk 500ml" --remove "Amul Milk" --cart
  npm run verify:live -- --data-dir ./.zepo-live --login --clear --cart

The report intentionally omits raw page text, addresses, cart item names, payment credentials, order ids, phone input, local filesystem paths, and unredacted workflow query arguments.

Stable report failure codes include live_*_contract_mismatch, live_verification_incomplete, live_runner_failed, live_command_launch_failed, live_command_timeout, live_summary_failed, live_json_unreadable, live_json_unexpected, and command_failed.`);
}
