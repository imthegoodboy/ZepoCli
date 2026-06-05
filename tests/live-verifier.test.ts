import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import packageJson from "../package.json" with { type: "json" };

const rootDir = resolve(import.meta.dirname, "..");
const scriptPath = resolve(rootDir, "scripts", "verify-live-flow.mjs");
const reportScriptPath = resolve(rootDir, "scripts", "verify-live-report.mjs");
const LIVE_VERIFIER_TEST_TIMEOUT_MS = 15_000;
const {
  adjustLiveReportRequestsForConfirmedSession,
  buildLiveCommandLaunchFailureStep,
  buildLiveCommandTimeoutOrErrorStep,
  buildLiveCommandTimeoutStep,
  buildLiveReportStep,
  createLiveConsoleTextRedactor,
  hasLiveReportMissingCoverage,
  LIVE_REPORT_NOTE,
  parseJsonFromOutput,
  redactArgsForLiveConsole,
  redactArgsForLiveReport,
  redactLiveConsoleText,
  summarizeCommandError,
  summarizeLiveReportAttempts,
  summarizeLiveReportCoverage,
  summarizeLiveReportMissingCoverage,
  summarizeLiveReportRequests,
  summarizeLiveRunnerFailure,
  validateLiveReportAcceptance
} = await import("../scripts/live-report-utils.mjs");

function automationDiagnosticsPayload(
  mode: { current?: "background_headless" | "visible_human_controlled"; visibleRequested?: boolean } = {}
) {
  const current = mode.current ?? "background_headless";
  const visibleRequested = mode.visibleRequested ?? false;
  return {
    version: packageJson.version,
    browserAutomationMode: {
      default: "background_headless",
      current,
      visibleRequested
    },
    browserAutomation: {
      ready: true,
      reasons: [],
      retryAfterMs: 0,
      modes: {
        backgroundHeadless: { ready: true, reasons: [], retryAfterMs: 0 },
        visibleHumanControlled: { ready: true, reasons: [], retryAfterMs: 0 }
      }
    },
    browserLock: { present: false, stale: false },
    headlessBrowserThrottle: {
      windowMs: 600_000,
      limit: 8,
      recentRuns: 0,
      throttleActive: false,
      retryAfterMs: 0
    },
    accessChallenge: { detected: false, cooldownActive: false, retryAfterMs: 0 }
  };
}

function automationDiagnosticsPayloadWithoutMode() {
  const { browserAutomationMode: _browserAutomationMode, ...payload } = automationDiagnosticsPayload();
  return payload;
}

function statusDiagnosticsPayload(
  mode: { current?: "background_headless" | "visible_human_controlled"; visibleRequested?: boolean } = {}
) {
  return {
    ...automationDiagnosticsPayload(mode),
    cache: { searches: 0, cartSnapshots: 0, addresses: 0, orders: 0 }
  };
}

function statusDiagnosticsPayloadWithoutMode() {
  return {
    ...automationDiagnosticsPayloadWithoutMode(),
    cache: { searches: 0, cartSnapshots: 0, addresses: 0, orders: 0 }
  };
}

function acceptedLiveReport(overrides: Record<string, unknown> = {}) {
  const steps = [
    {
      name: "doctor",
      command: "zepo --data-dir <redacted-data-dir> doctor --json",
      exitCode: 0,
      ok: true,
      summary: {
        ok: true,
        browserAutomationReady: true,
        playwrightChromiumPassed: true,
        warnings: [],
        failures: []
      }
    },
    {
      name: "status",
      command: "zepo --data-dir <redacted-data-dir> status --json",
      exitCode: 0,
      ok: true,
      summary: {
        confirmedSession: true,
        browserAutomationReady: true
      }
    },
    {
      name: "status live",
      command: "zepo --data-dir <redacted-data-dir> --visible status --live --json",
      exitCode: 0,
      ok: true,
      summary: {
        confirmedSession: true,
        browserAutomationReady: true,
        liveSessionState: "logged-in"
      }
    },
    {
      name: "search",
      command: "zepo --data-dir <redacted-data-dir> --visible search <redacted-query> --json",
      exitCode: 0,
      ok: true,
      summary: {
        productCount: 1,
        productDetailCount: 1
      }
    },
    {
      name: "checkout",
      command: "zepo --data-dir <redacted-data-dir> --visible checkout --json",
      exitCode: 0,
      ok: true,
      summary: {
        status: "checkout_handoff_returned",
        cartPrecondition: "non_empty_cart_verified",
        paymentStatus: "not_observed_by_zepocli",
        orderPlacement: "not_confirmed_by_zepocli",
        orderStatusCommand: "zepo track"
      }
    }
  ];
  const requested = summarizeLiveReportRequests({
    search: "milk",
    checkout: true
  });
  const coverage = summarizeLiveReportCoverage(steps);

  return {
    ok: true,
    version: packageJson.version,
    generatedAt: "2026-05-31T00:00:00.000Z",
    dataDir: "<redacted-data-dir>",
    reportPath: "<redacted-report-path>",
    note: LIVE_REPORT_NOTE,
    requested,
    attempted: summarizeLiveReportAttempts(steps),
    coverage,
    missingCoverage: summarizeLiveReportMissingCoverage(requested, coverage),
    steps,
    ...overrides
  };
}

function productionScopeLiveReport(overrides: Record<string, unknown> = {}) {
  const steps = [
    ...acceptedLiveReport().steps.slice(0, 3),
    {
      name: "address use",
      command: "zepo --data-dir <redacted-data-dir> --visible address use <redacted-address-query> --json",
      exitCode: 0,
      ok: true,
      summary: {
        selected: true,
        hasAddressText: true,
        hasAddressDetail: true
      }
    },
    acceptedLiveReport().steps[3],
    {
      name: "add",
      command: "zepo --data-dir <redacted-data-dir> --visible add <redacted-query> --quantity 1 --json",
      exitCode: 0,
      ok: true,
      summary: {
        productAdded: true,
        productHasDetail: true,
        cartItemCount: 1
      }
    },
    {
      name: "cart",
      command: "zepo --data-dir <redacted-data-dir> --visible cart --json",
      exitCode: 0,
      ok: true,
      summary: {
        cartItemCount: 1,
        hasTotal: true
      }
    },
    {
      ...acceptedLiveReport().steps[4],
      command: "zepo --data-dir <redacted-data-dir> --visible checkout --wait --json"
    },
    {
      name: "track",
      command: "zepo --data-dir <redacted-data-dir> --visible track --json",
      exitCode: 0,
      ok: true,
      summary: {
        orderCount: 1,
        latestHasStatus: true,
        latestHasEta: false
      }
    }
  ];
  const requested = summarizeLiveReportRequests({
    search: "milk",
    address: "home",
    add: "milk",
    cart: true,
    checkout: true,
    track: true
  });
  const coverage = summarizeLiveReportCoverage(steps);

  return {
    ...acceptedLiveReport(),
    requested,
    attempted: summarizeLiveReportAttempts(steps),
    coverage,
    missingCoverage: summarizeLiveReportMissingCoverage(requested, coverage),
    steps,
    ...overrides
  };
}

describe("live verification runner", () => {
  it("documents the opt-in human-controlled flow", () => {
    const result = spawnSync(process.execPath, [scriptPath, "--help"], {
      cwd: rootDir,
      encoding: "utf8"
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Usage: npm --silent run verify:live");
    expect(result.stdout).toContain("human-controlled live verification");
    expect(result.stdout).toContain("--checkout");
    expect(result.stdout).toContain("--production-scope");
    expect(result.stdout).toContain("Final readiness preset");
    expect(result.stdout).toContain("with checkout wait enabled");
    expect(result.stdout).toContain("--checkout-remove-limit-items");
    expect(result.stdout).toContain("--browser-locale <locale>");
    expect(result.stdout).toContain("--browser-timezone <timezone>");
    expect(result.stdout).toContain("--remove <query>");
    expect(result.stdout).toContain("--clear");
    expect(result.stdout).toContain("--reorder-last");
    expect(result.stdout).toContain("--choose-add");
    expect(result.stdout).toContain("--checkout-wait");
    expect(result.stdout).toContain("manual payment controls still do not count as checkout handoff coverage");
    expect(result.stdout).toContain(
      'npm --silent run verify:live -- --data-dir ./.zepo-live --login --production-scope --search milk --address home --add "Amul Milk 500ml"'
    );
    expect(result.stdout).toContain("accepts 10-digit, +91, or leading-0 Indian mobile formats");
    expect(result.stdout).toContain(
      "If checkout remains at checkout_manual_action_required, production-scope verification stops before track"
    );
    expect(result.stdout).toContain("requested, attempted, coverage, and missingCoverage booleans");
    expect(result.stdout).toContain("partial runs cannot be mistaken for full verification");
    expect(result.stdout).toContain(
      "omits raw page text, addresses, cart item names, payment credentials, order ids, phone input, local filesystem paths, standalone percent-encoded sensitive fragments, and unredacted workflow query arguments"
    );
    expect(result.stdout).toContain("npm-token-shaped values");
    expect(result.stdout).toContain("Stable report failure codes include");
    expect(result.stdout).toContain("live_*_contract_mismatch");
    expect(result.stdout).toContain("live_verification_incomplete");
    expect(result.stdout).toContain("live_command_launch_failed");
    expect(result.stdout).toContain("live_command_timeout");
    expect(result.stdout).toContain("live_summary_failed");
    expect(result.stdout).toContain("command_failed");
    expect(result.stdout).toContain("--step-timeout <ms>");
    expect(result.stdout).toContain("npm --silent run verify:live");
    expect(result.stdout).toContain(
      "If --login is supplied and status already confirms the session, the report requires liveSession coverage instead of a fresh login step."
    );
    expect(result.stdout).toContain(
      "Use --production-scope for the final production readiness run; it requests browser preflight, local status, live session, address selection, search, add, non-empty cart, checkout handoff, and track coverage, with checkout wait enabled so a human can complete Zepto-side checkout/payment before tracking."
    );
    expect(result.stdout).toContain(
      "Use --checkout-remove-limit-items only when the visible Zepto cart shows item-limit warnings"
    );
    expect(result.stdout).not.toContain("prefer npm --silent run verify:live");
  });

  it("documents production-scope report acceptance", () => {
    const result = spawnSync(process.execPath, [reportScriptPath, "--help"], {
      cwd: rootDir,
      encoding: "utf8"
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "Usage: npm --silent run verify:live:report -- [--require-production-scope] [--max-age-minutes <minutes>]"
    );
    expect(result.stdout).toContain("Use --require-production-scope for final readiness");
    expect(result.stdout).toContain("requires --max-age-minutes");
    expect(result.stdout).toContain("Use --max-age-minutes so old saved reports cannot be reused as current evidence");
    expect(result.stdout).toContain("generatedAt is not older than the requested freshness window");
    expect(result.stdout).toContain("local status readiness");
    expect(result.stdout).toContain(
      "core login/session, search, address, non-empty cart, checkout handoff, and track workflow was requested and has passing coverage"
    );
    expect(result.stdout).toContain(
      "checkout wait evidence is present so a human can complete Zepto-side checkout/payment before tracking"
    );
    expect(result.stdout).toContain(
      "address-add, address-list, remove, clear, history, and reorder workflows are not requested, attempted, or covered"
    );
    expect(result.stdout).toContain("--max-age-minutes is also used so the report is fresh evidence");
  });

  it("waits for timed-out live commands to close before recording timeout failures", () => {
    const script = readFileSync(scriptPath, "utf8");

    expect(script).toContain("COMMAND_TIMEOUT_FORCE_KILL_GRACE_MS = 30_000");
    expect(script).toContain('child.kill("SIGTERM")');
    expect(script).toContain('child.kill("SIGKILL")');
    expect(script).toContain("clearForceKillTimer(forceKill)");
    expect(script).toContain("if (timedOut)");
    expect(script.match(/liveCommandTimeoutError\(options\.stepTimeoutMs, \{ stdout, stderr \}\)/g)).toHaveLength(2);
    expect(script).toContain("buildLiveCommandTimeoutOrErrorStep({");
    expect(script).toContain("stderr: error.stderr");
  });

  it("writes sanitized partial reports when live verification is interrupted", () => {
    const script = readFileSync(scriptPath, "utf8");

    expect(script).toContain('process.once("SIGINT", () => handleInterrupt("SIGINT"))');
    expect(script).toContain('process.once("SIGTERM", () => handleInterrupt("SIGTERM"))');
    expect(script).toContain("Live verification interrupted by the user.");
    expect(script).toContain("Review the visible Zepto browser state, then rerun verify:live when ready.");
    expect(script).toContain('child.kill("SIGTERM")');
    expect(script).toContain('child.kill("SIGKILL")');
    expect(script).toContain("finishInterruptedRun(signal, exitCode)");
    expect(script).toContain("writeLiveReport(reportPath, report)");
    expect(script).toContain("Live verification report: <redacted-report-path>");
  });

  it("runs mode-aware doctor in live verification so Chromium launch is checked", () => {
    const script = readFileSync(scriptPath, "utf8");

    expect(script).toContain("const preflightArgs = baseCliArgs({ visible: shouldUseVisiblePreflight() })");
    expect(script).toContain('runStep("doctor", [...preflightArgs, "doctor", "--json"])');
    expect(script).toContain('runStep("status", [...preflightArgs, "status", "--json"])');
    expect(script).toContain("function shouldUseVisiblePreflight()");
    expect(script).toContain("return report.requested.liveSession === true");
    expect(script).not.toContain('runStep("doctor", ["--data-dir", options.dataDir, "doctor", "--skip-browser", "--json"])');
    expect(script).toContain('args.push("--browser-locale", options.browserLocale)');
    expect(script).toContain('args.push("--browser-timezone", options.browserTimezone)');
    expect(script).toContain("browserAutomationReady: payload.browserAutomation?.ready === true");
    expect(script).toContain("productCount: readableProductCount(payload)");
    expect(script).toContain("productDetailCount: detailedProductCount(payload)");
    expect(script).toContain("productHasDetail: hasReadableProductDetail(payload.product)");
    expect(script).toContain("const addressCount = readableAddressCount(addresses)");
    expect(script).toContain("addressCount,");
    expect(script).toContain("selectedCount: readableSelectedAddressCount(addresses)");
    expect(script).toContain("hasAddressDetail: addressCount > 0");
    expect(script).toContain("cartItemCount: readableCartItemCount(payload)");
    expect(script).toContain("orderCount: readableOrderCount(orders)");
    expect(script).toContain("latestHasStatus: hasReadableText(orders[0]?.status)");
    expect(script).toContain("latestHasEta: hasReadableText(orders[0]?.eta)");
    expect(script).not.toContain('latestHasStatus: typeof orders[0]?.status === "string"');
    expect(script).not.toContain('latestHasEta: typeof orders[0]?.eta === "string"');
    expect(script).toContain('const playwrightChromiumCheck = checks.find((check) => check.name === "Playwright Chromium")');
    expect(script).toContain('playwrightChromiumPassed: playwrightChromiumCheck?.status === "pass"');
  });

  it("can forward human product selection to zepo add during live verification", () => {
    const script = readFileSync(scriptPath, "utf8");

    expect(script).toContain("options.chooseAdd");
    expect(script).toContain('addArgs.splice(addArgs.length - 1, 0, "--choose")');
  });

  it("can pause checkout for manual Zepto continuation before tracking", () => {
    const script = readFileSync(scriptPath, "utf8");

    expect(script).toContain("options.checkoutWait");
    expect(script).toContain("parsed.checkoutWait = true");
    expect(script).toContain('checkoutArgs.splice(checkoutArgs.length - 1, 0, "--wait")');
    expect(script).toContain("options.checkoutRemoveLimitItems");
    expect(script).toContain('checkoutArgs.splice(checkoutArgs.length - 1, 0, "--remove-limit-items")');
    expect(script).toContain("shouldContinueAfterManualCheckout(checkoutResult)");
    expect(script).toContain("function shouldContinueAfterManualCheckout(result)");
    expect(script).toContain("!options.productionScope");
    expect(script).toContain("Checkout stopped at Zepto's manual payment-control boundary; continuing to track because --checkout-wait was requested.");
    expect(script).toContain('result?.payload?.status === "checkout_manual_action_required"');
  });

  it("stops production-scope verification before tracking when checkout remains manual-only", () => {
    const script = readFileSync(scriptPath, "utf8");

    expect(script).toContain(
      "Production-scope verification stops before tracking because checkout handoff coverage is missing."
    );
    expect(script.indexOf("!options.productionScope")).toBeGreaterThan(script.indexOf("function shouldContinueAfterManualCheckout"));
    expect(script).toContain(
      "If checkout remains at checkout_manual_action_required, production-scope verification stops before track"
    );
  });

  it("stores the package version in sanitized live reports", () => {
    const script = readFileSync(scriptPath, "utf8");

    expect(script).toContain("version: packageJson.version");
    expect(script).toContain('readFileSync(resolve(rootDir, "package.json"), "utf8")');
    expect(script).toContain("const requestedCoverage = summarizeLiveReportRequests(options)");
    expect(script).toContain("requested: requestedCoverage");
    expect(script).toContain("report.requested = adjustLiveReportRequestsForConfirmedSession(report.requested, status.payload)");
    expect(script).toContain("attempted: summarizeLiveReportAttempts([])");
    expect(script).toContain("const initialCoverage = summarizeLiveReportCoverage([])");
    expect(script).toContain("coverage: initialCoverage");
    expect(script).toContain("missingCoverage: summarizeLiveReportMissingCoverage");
    expect(script).toContain("hasLiveReportMissingCoverage(report.missingCoverage)");
    expect(script).toContain("updateReportCoverage()");
  });

  it("retries only ambiguous live-session checks without keeping failed duplicate report steps", () => {
    const script = readFileSync(scriptPath, "utf8");

    expect(script).toContain("const LIVE_STATUS_MAX_ATTEMPTS = 3");
    expect(script).toContain("const LIVE_STATUS_RETRY_DELAY_MS = 5_000");
    expect(script).toContain("if (report.requested.liveSession !== true)");
    expect(script).toContain("const liveStatus = await runLiveStatusStep()");
    expect(script).toContain("isRetryableUnknownLiveStatus(result)");
    expect(script).toContain('result?.payload?.liveSession?.state === "unknown"');
    expect(script).toContain('removeLastReportStep("status live")');
    expect(script).not.toContain('result?.payload?.liveSession?.state !== "login-required"');
  });

  it("does not run visible live-session checks for local-only report scope", () => {
    const script = readFileSync(scriptPath, "utf8");
    const requestedScopeGuard = script.indexOf("if (report.requested.liveSession !== true)");
    const liveStatusStep = script.indexOf("const liveStatus = await runLiveStatusStep()");

    expect(requestedScopeGuard).toBeGreaterThan(script.indexOf("report.requested = adjustLiveReportRequestsForConfirmedSession"));
    expect(requestedScopeGuard).toBeLessThan(liveStatusStep);
    expect(script).toContain("if (report.requested.liveSession !== true) {\n    return;\n  }\n\n  const liveStatus");
  });

  it("summarizes successful live report coverage without sensitive workflow data", () => {
    expect(
      summarizeLiveReportCoverage([
        { name: "doctor", ok: true },
        { name: "status", ok: true },
        { name: "login", ok: false },
        { name: "status live", ok: true },
        { name: "search", ok: true },
        { name: "address use", ok: true },
        { name: "add", ok: true },
        { name: "cart", ok: true },
        { name: "checkout", ok: true },
        { name: "track", ok: true },
        { name: "history", ok: false },
        { name: "reorder", ok: true },
        { name: "unknown", ok: true }
      ])
    ).toEqual({
      browserPreflight: true,
      localStatus: true,
      login: false,
      liveSession: true,
      search: true,
      addressAdd: false,
      addressList: false,
      addressUse: true,
      add: true,
      cart: true,
      remove: false,
      clear: false,
      checkoutHandoff: true,
      track: true,
      history: false,
      reorder: true
    });
  });

  it("summarizes attempted live report steps separately from passing coverage", () => {
    expect(
      summarizeLiveReportAttempts([
        { name: "doctor", ok: true },
        { name: "status", ok: true },
        { name: "login", ok: false },
        { name: "status live", ok: false },
        { name: "search", ok: true },
        { name: "address add", ok: false },
        { name: "address list", ok: false },
        { name: "address use", ok: true },
        { name: "add", ok: false },
        { name: "cart", ok: false },
        { name: "remove", ok: true },
        { name: "clear", ok: false },
        { name: "checkout", ok: false },
        { name: "track", ok: true },
        { name: "history", ok: false },
        { name: "reorder", ok: false },
        { name: "unknown", ok: false },
        undefined
      ])
    ).toEqual({
      browserPreflight: true,
      localStatus: true,
      login: true,
      liveSession: true,
      search: true,
      addressAdd: true,
      addressList: true,
      addressUse: true,
      add: true,
      cart: true,
      remove: true,
      clear: true,
      checkoutHandoff: true,
      track: true,
      history: true,
      reorder: true
    });
  });

  it("does not count manual session preconditions as login attempts", () => {
    expect(
      summarizeLiveReportAttempts([
        {
          name: "session precondition",
          command: "manual",
          exitCode: 1,
          ok: false,
          error: {
            code: "live_verification_incomplete",
            message: "No confirmed Zepto session is available."
          }
        }
      ])
    ).toEqual({
      browserPreflight: false,
      localStatus: false,
      login: false,
      liveSession: false,
      search: false,
      addressAdd: false,
      addressList: false,
      addressUse: false,
      add: false,
      cart: false,
      remove: false,
      clear: false,
      checkoutHandoff: false,
      track: false,
      history: false,
      reorder: false
    });
  });

  it("summarizes requested live report scope without sensitive option values", () => {
    expect(
      summarizeLiveReportRequests({
        login: true,
        search: "healthy snacks",
        address: "Home Tower 7",
        addressAdd: false,
        addressList: false,
        add: "protein bars",
        cart: false,
        remove: "protein bars",
        clear: false,
        checkout: true,
        track: true,
        history: true,
        reorderLast: true
      })
    ).toEqual({
      browserPreflight: true,
      localStatus: true,
      login: true,
      liveSession: true,
      search: true,
      addressAdd: false,
      addressList: false,
      addressUse: true,
      add: true,
      cart: true,
      remove: true,
      clear: false,
      checkoutHandoff: true,
      track: true,
      history: true,
      reorder: true
    });

    expect(
      summarizeLiveReportRequests({
        login: false,
        checkout: false
      })
    ).toEqual({
      browserPreflight: true,
      localStatus: true,
      login: false,
      liveSession: false,
      search: false,
      addressAdd: false,
      addressList: false,
      addressUse: false,
      add: false,
      cart: false,
      remove: false,
      clear: false,
      checkoutHandoff: false,
      track: false,
      history: false,
      reorder: false
    });
  });

  it("treats --login as conditional when the data directory already has a confirmed session", () => {
    const requested = summarizeLiveReportRequests({
      login: true
    });

    const adjusted = adjustLiveReportRequestsForConfirmedSession(requested, {
      confirmedSession: true
    });

    expect(adjusted).toEqual({
      browserPreflight: true,
      localStatus: true,
      login: false,
      liveSession: true,
      search: false,
      addressAdd: false,
      addressList: false,
      addressUse: false,
      add: false,
      cart: false,
      remove: false,
      clear: false,
      checkoutHandoff: false,
      track: false,
      history: false,
      reorder: false
    });
    expect(requested.login).toBe(true);

    const missingCoverage = summarizeLiveReportMissingCoverage(
      adjusted,
      summarizeLiveReportCoverage([
        { name: "doctor", ok: true },
        { name: "status", ok: true },
        { name: "status live", ok: true }
      ])
    );

    expect(missingCoverage.login).toBe(false);
    expect(missingCoverage.liveSession).toBe(false);
    expect(hasLiveReportMissingCoverage(missingCoverage)).toBe(false);
    expect(adjustLiveReportRequestsForConfirmedSession(requested, { confirmedSession: false })).toBe(requested);
  });

  it("validates live report acceptance without reusing partial coverage as proof", () => {
    expect(validateLiveReportAcceptance(acceptedLiveReport(), { expectedVersion: packageJson.version })).toEqual({
      accepted: true,
      issues: []
    });
    expect(
      validateLiveReportAcceptance(
        acceptedLiveReport({
          steps: acceptedLiveReport().steps.map((step) => ({
            ...step,
            command: step.command.replace(
              "zepo --data-dir <redacted-data-dir>",
              "zepo --data-dir <redacted-data-dir> --browser-locale <redacted-browser-locale> --browser-timezone <redacted-browser-timezone>"
            )
          }))
        }),
        { expectedVersion: packageJson.version }
      )
    ).toEqual({
      accepted: true,
      issues: []
    });
    expect(validateLiveReportAcceptance(acceptedLiveReport()).issues.map((issue) => issue.code)).toContain(
      "live_report_expected_version_missing"
    );
    expect(
      validateLiveReportAcceptance(acceptedLiveReport({ generatedAt: new Date().toISOString() }), {
        expectedVersion: packageJson.version,
        maxAgeMs: 60_000
      })
    ).toEqual({
      accepted: true,
      issues: []
    });
    expect(
      validateLiveReportAcceptance(
        acceptedLiveReport({ generatedAt: new Date(Date.now() - 2 * 60 * 60 * 1_000).toISOString() }),
        {
          expectedVersion: packageJson.version,
          maxAgeMs: 60 * 60 * 1_000
        }
      ).issues.map((issue) => issue.code)
    ).toContain("live_report_stale");
    expect(
      validateLiveReportAcceptance(acceptedLiveReport(), {
        expectedVersion: packageJson.version,
        maxAgeMs: 0
      }).issues.map((issue) => issue.code)
    ).toContain("live_report_max_age_invalid");
    expect(
      validateLiveReportAcceptance(acceptedLiveReport({ generatedAt: new Date().toISOString() }), {
        expectedVersion: packageJson.version,
        requireProductionScope: true,
        maxAgeMs: 60_000
      }).issues.map((issue) => issue.code)
    ).toContain("live_report_production_scope_missing");
    expect(
      validateLiveReportAcceptance(productionScopeLiveReport({ generatedAt: new Date().toISOString() }), {
        expectedVersion: packageJson.version,
        requireProductionScope: true,
        maxAgeMs: 60_000
      })
    ).toEqual({
      accepted: true,
      issues: []
    });
    expect(
      validateLiveReportAcceptance(
        productionScopeLiveReport({
          generatedAt: new Date().toISOString(),
          steps: productionScopeLiveReport().steps.map((step) =>
            step.name === "checkout"
              ? {
                  ...step,
                  command: "zepo --data-dir <redacted-data-dir> --visible checkout --remove-limit-items --wait --json"
                }
              : step
          )
        }),
        {
          expectedVersion: packageJson.version,
          requireProductionScope: true,
          maxAgeMs: 60_000
        }
      )
    ).toEqual({
      accepted: true,
      issues: []
    });
    const noWaitProductionScope = productionScopeLiveReport({
      generatedAt: new Date().toISOString(),
      steps: productionScopeLiveReport().steps.map((step) =>
        step.name === "checkout"
          ? {
              ...step,
              command: "zepo --data-dir <redacted-data-dir> --visible checkout --json"
            }
          : step
      )
    });
    noWaitProductionScope.attempted = summarizeLiveReportAttempts(noWaitProductionScope.steps);
    noWaitProductionScope.coverage = summarizeLiveReportCoverage(noWaitProductionScope.steps);
    noWaitProductionScope.missingCoverage = summarizeLiveReportMissingCoverage(
      noWaitProductionScope.requested,
      noWaitProductionScope.coverage
    );
    expect(
      validateLiveReportAcceptance(noWaitProductionScope, {
        expectedVersion: packageJson.version,
        requireProductionScope: true,
        maxAgeMs: 60_000
      }).issues.map((issue) => issue.code)
    ).toContain("live_report_production_scope_checkout_wait_missing");
    expect(
      validateLiveReportAcceptance(productionScopeLiveReport({ generatedAt: new Date().toISOString() }), {
        expectedVersion: packageJson.version,
        requireProductionScope: true
      }).issues.map((issue) => issue.code)
    ).toContain("live_report_production_scope_freshness_missing");
    const unrequestedProductionScope = productionScopeLiveReport({
      generatedAt: new Date().toISOString(),
      requested: {
        ...productionScopeLiveReport().requested,
        search: false
      }
    });
    unrequestedProductionScope.missingCoverage = summarizeLiveReportMissingCoverage(
      unrequestedProductionScope.requested,
      unrequestedProductionScope.coverage
    );
    expect(
      validateLiveReportAcceptance(unrequestedProductionScope, {
        expectedVersion: packageJson.version,
        requireProductionScope: true,
        maxAgeMs: 60_000
      }).issues.map((issue) => issue.code)
    ).toContain("live_report_production_scope_missing");
    const extraProductionScope = productionScopeLiveReport({ generatedAt: new Date().toISOString() });
    extraProductionScope.steps = [
      ...extraProductionScope.steps,
      {
        name: "history",
        command: "zepo --data-dir <redacted-data-dir> --visible history --json",
        exitCode: 0,
        ok: true,
        summary: {
          orderCount: 1,
          latestHasStatus: true,
          latestHasEta: false
        }
      }
    ];
    extraProductionScope.requested = {
      ...extraProductionScope.requested,
      history: true
    };
    extraProductionScope.attempted = summarizeLiveReportAttempts(extraProductionScope.steps);
    extraProductionScope.coverage = summarizeLiveReportCoverage(extraProductionScope.steps);
    extraProductionScope.missingCoverage = summarizeLiveReportMissingCoverage(
      extraProductionScope.requested,
      extraProductionScope.coverage
    );
    expect(
      validateLiveReportAcceptance(extraProductionScope, {
        expectedVersion: packageJson.version,
        requireProductionScope: true,
        maxAgeMs: 60_000
      }).issues.map((issue) => issue.code)
    ).toContain("live_report_production_scope_extra");

    const emptyCartProductionScope = productionScopeLiveReport({
      generatedAt: new Date().toISOString(),
      steps: productionScopeLiveReport().steps.map((step) =>
        step.name === "cart"
          ? {
              ...step,
              summary: {
                cartItemCount: 0,
                hasTotal: false
              }
            }
          : step
      )
    });
    emptyCartProductionScope.attempted = summarizeLiveReportAttempts(emptyCartProductionScope.steps);
    emptyCartProductionScope.coverage = summarizeLiveReportCoverage(emptyCartProductionScope.steps);
    emptyCartProductionScope.missingCoverage = summarizeLiveReportMissingCoverage(
      emptyCartProductionScope.requested,
      emptyCartProductionScope.coverage
    );
    expect(
      validateLiveReportAcceptance(emptyCartProductionScope, {
        expectedVersion: packageJson.version,
        requireProductionScope: true,
        maxAgeMs: 60_000
      }).issues.map((issue) => issue.code)
    ).toContain("live_report_production_scope_cart_empty");

    const missingLiveSession = acceptedLiveReport();
    missingLiveSession.coverage = {
      ...missingLiveSession.coverage,
      liveSession: false
    };
    missingLiveSession.missingCoverage = summarizeLiveReportMissingCoverage(
      missingLiveSession.requested,
      missingLiveSession.coverage
    );

    const missingResult = validateLiveReportAcceptance(missingLiveSession, {
      expectedVersion: packageJson.version
    });

    expect(missingResult.accepted).toBe(false);
    expect(missingResult.issues.map((issue) => issue.code)).toContain("live_report_missing_coverage");
    expect(missingResult.issues.map((issue) => issue.code)).toContain("live_report_requested_coverage_missing");
    expect(missingResult.issues.map((issue) => issue.code)).toContain("live_report_coverage_mismatch");

    const inconsistentAttempted = acceptedLiveReport();
    inconsistentAttempted.attempted = {
      ...inconsistentAttempted.attempted,
      search: false
    };

    expect(
      validateLiveReportAcceptance(inconsistentAttempted, {
        expectedVersion: packageJson.version
      }).issues.map((issue) => issue.code)
    ).toContain("live_report_attempted_mismatch");

    const inconsistentCoverage = acceptedLiveReport();
    inconsistentCoverage.coverage = {
      ...inconsistentCoverage.coverage,
      search: false
    };
    inconsistentCoverage.missingCoverage = summarizeLiveReportMissingCoverage(
      inconsistentCoverage.requested,
      inconsistentCoverage.coverage
    );

    expect(
      validateLiveReportAcceptance(inconsistentCoverage, {
        expectedVersion: packageJson.version
      }).issues.map((issue) => issue.code)
    ).toContain("live_report_coverage_mismatch");

    const malformedCapabilityReports = [
      acceptedLiveReport({
        requested: {
          ...acceptedLiveReport().requested,
          search: "true"
        }
      }),
      acceptedLiveReport({
        attempted: {
          ...acceptedLiveReport().attempted,
          checkoutHandoff: 1
        }
      }),
      acceptedLiveReport({
        coverage: {
          ...acceptedLiveReport().coverage,
          search: "yes"
        }
      }),
      acceptedLiveReport({
        missingCoverage: {
          ...acceptedLiveReport().missingCoverage,
          checkoutHandoff: "false"
        }
      }),
      acceptedLiveReport({
        requested: Object.fromEntries(
          Object.entries(acceptedLiveReport().requested).filter(([key]) => key !== "search")
        )
      })
    ];

    for (const report of malformedCapabilityReports) {
      const result = validateLiveReportAcceptance(report, {
        expectedVersion: packageJson.version
      });
      expect(result.accepted).toBe(false);
      expect(result.issues.map((issue) => issue.code)).toContain("live_report_capability_summary_mismatch");
      expect(JSON.stringify(result.issues)).not.toContain("yes");
    }

    const failedKnownStepReport = acceptedLiveReport({
      steps: [
        ...acceptedLiveReport().steps,
        {
          name: "cart",
          command: "zepo --data-dir <redacted-data-dir> --visible cart --json",
          exitCode: 1,
          ok: false,
          error: {
            code: "command_failed",
            message: "failed"
          }
        }
      ]
    });
    failedKnownStepReport.attempted = summarizeLiveReportAttempts(failedKnownStepReport.steps);
    failedKnownStepReport.coverage = summarizeLiveReportCoverage(failedKnownStepReport.steps);
    failedKnownStepReport.missingCoverage = summarizeLiveReportMissingCoverage(
      failedKnownStepReport.requested,
      failedKnownStepReport.coverage
    );

    const failedKnownStepResult = validateLiveReportAcceptance(failedKnownStepReport, {
      expectedVersion: packageJson.version
    });
    expect(failedKnownStepResult.accepted).toBe(false);
    expect(failedKnownStepResult.issues.map((issue) => issue.code)).toContain("live_report_ok_step_mismatch");
    expect(JSON.stringify(failedKnownStepResult.issues)).not.toContain("failed");

    const unknownStepReport = acceptedLiveReport({
      steps: [
        ...acceptedLiveReport().steps,
        {
          name: "live runner",
          command: "internal",
          exitCode: 1,
          ok: false,
          error: {
            code: "live_runner_failed",
            message: "failed"
          }
        }
      ]
    });
    unknownStepReport.attempted = summarizeLiveReportAttempts(unknownStepReport.steps);
    unknownStepReport.coverage = summarizeLiveReportCoverage(unknownStepReport.steps);
    unknownStepReport.missingCoverage = summarizeLiveReportMissingCoverage(
      unknownStepReport.requested,
      unknownStepReport.coverage
    );

    const unknownStepResult = validateLiveReportAcceptance(unknownStepReport, {
      expectedVersion: packageJson.version
    });
    expect(unknownStepResult.accepted).toBe(false);
    expect(unknownStepResult.issues.map((issue) => issue.code)).toContain("live_report_ok_step_mismatch");
    expect(JSON.stringify(unknownStepResult.issues)).not.toContain("failed");

    const duplicateStepReport = acceptedLiveReport({
      steps: [
        ...acceptedLiveReport().steps,
        {
          name: "checkout",
          command: "zepo --data-dir <redacted-data-dir> --visible checkout --json",
          exitCode: 0,
          ok: true,
          summary: {
            status: "checkout_handoff_returned",
            cartPrecondition: "non_empty_cart_verified",
            paymentStatus: "paid",
            orderPlacement: "confirmed",
            orderStatusCommand: "zepo track"
          }
        }
      ]
    });
    duplicateStepReport.attempted = summarizeLiveReportAttempts(duplicateStepReport.steps);
    duplicateStepReport.coverage = summarizeLiveReportCoverage(duplicateStepReport.steps);
    duplicateStepReport.missingCoverage = summarizeLiveReportMissingCoverage(
      duplicateStepReport.requested,
      duplicateStepReport.coverage
    );

    const duplicateStepResult = validateLiveReportAcceptance(duplicateStepReport, {
      expectedVersion: packageJson.version
    });
    expect(duplicateStepResult.accepted).toBe(false);
    expect(duplicateStepResult.issues.map((issue) => issue.code)).toContain(
      "live_report_step_uniqueness_mismatch"
    );
    expect(JSON.stringify(duplicateStepResult.issues)).not.toContain("paid");

    const outOfOrderStepReport = acceptedLiveReport({
      steps: [
        acceptedLiveReport().steps[0],
        acceptedLiveReport().steps[1],
        acceptedLiveReport().steps[4],
        acceptedLiveReport().steps[2],
        acceptedLiveReport().steps[3]
      ]
    });
    outOfOrderStepReport.attempted = summarizeLiveReportAttempts(outOfOrderStepReport.steps);
    outOfOrderStepReport.coverage = summarizeLiveReportCoverage(outOfOrderStepReport.steps);
    outOfOrderStepReport.missingCoverage = summarizeLiveReportMissingCoverage(
      outOfOrderStepReport.requested,
      outOfOrderStepReport.coverage
    );

    const outOfOrderStepResult = validateLiveReportAcceptance(outOfOrderStepReport, {
      expectedVersion: packageJson.version
    });
    expect(outOfOrderStepResult.accepted).toBe(false);
    expect(outOfOrderStepResult.issues.map((issue) => issue.code)).toContain("live_report_step_order_mismatch");

    const reportWithLoginStep = acceptedLiveReport({
      requested: summarizeLiveReportRequests({
        login: true,
        search: "milk",
        checkout: true
      }),
      steps: [
        acceptedLiveReport().steps[0],
        acceptedLiveReport().steps[1],
        {
          name: "login",
          command: "zepo --data-dir <redacted-data-dir> --visible login --json",
          exitCode: 0,
          ok: true,
          summary: {
            sessionSaved: true,
            confirmedSession: true
          }
        },
        ...acceptedLiveReport().steps.slice(2)
      ]
    });
    reportWithLoginStep.attempted = summarizeLiveReportAttempts(reportWithLoginStep.steps);
    reportWithLoginStep.coverage = summarizeLiveReportCoverage(reportWithLoginStep.steps);
    reportWithLoginStep.missingCoverage = summarizeLiveReportMissingCoverage(
      reportWithLoginStep.requested,
      reportWithLoginStep.coverage
    );

    expect(
      validateLiveReportAcceptance(reportWithLoginStep, {
        expectedVersion: packageJson.version
      })
    ).toEqual({
      accepted: true,
      issues: []
    });

    const badLoginSummaryReport = acceptedLiveReport({
      requested: reportWithLoginStep.requested,
      steps: reportWithLoginStep.steps.map((step) =>
        step.name === "login"
          ? {
              ...step,
              summary: {
                sessionSaved: true,
                confirmedSession: false
              }
            }
          : step
      )
    });
    badLoginSummaryReport.attempted = summarizeLiveReportAttempts(badLoginSummaryReport.steps);
    badLoginSummaryReport.coverage = summarizeLiveReportCoverage(badLoginSummaryReport.steps);
    badLoginSummaryReport.missingCoverage = summarizeLiveReportMissingCoverage(
      badLoginSummaryReport.requested,
      badLoginSummaryReport.coverage
    );

    const badLoginSummaryResult = validateLiveReportAcceptance(badLoginSummaryReport, {
      expectedVersion: packageJson.version
    });
    expect(badLoginSummaryResult.accepted).toBe(false);
    expect(badLoginSummaryResult.issues.map((issue) => issue.code)).toContain(
      "live_report_step_contract_mismatch"
    );

    const badLiveSessionReadinessReport = acceptedLiveReport({
      steps: acceptedLiveReport().steps.map((step) =>
        step.name === "status live"
          ? {
              ...step,
              summary: {
                ...step.summary,
                browserAutomationReady: false
              }
            }
          : step
      )
    });
    badLiveSessionReadinessReport.attempted = summarizeLiveReportAttempts(
      badLiveSessionReadinessReport.steps
    );
    badLiveSessionReadinessReport.coverage = summarizeLiveReportCoverage(
      badLiveSessionReadinessReport.steps
    );
    badLiveSessionReadinessReport.missingCoverage = summarizeLiveReportMissingCoverage(
      badLiveSessionReadinessReport.requested,
      badLiveSessionReadinessReport.coverage
    );

    const badLiveSessionReadinessResult = validateLiveReportAcceptance(
      badLiveSessionReadinessReport,
      {
        expectedVersion: packageJson.version
      }
    );
    expect(badLiveSessionReadinessResult.accepted).toBe(false);
    expect(badLiveSessionReadinessResult.issues.map((issue) => issue.code)).toContain(
      "live_report_step_contract_mismatch"
    );

    const stringlySummaryReport = acceptedLiveReport({
      steps: acceptedLiveReport().steps.map((step) =>
        step.name === "search"
          ? {
              ...step,
              summary: {
                productCount: "1"
              }
            }
          : step
      )
    });
    stringlySummaryReport.attempted = summarizeLiveReportAttempts(stringlySummaryReport.steps);
    stringlySummaryReport.coverage = summarizeLiveReportCoverage(stringlySummaryReport.steps);
    stringlySummaryReport.missingCoverage = summarizeLiveReportMissingCoverage(
      stringlySummaryReport.requested,
      stringlySummaryReport.coverage
    );

    const stringlySummaryResult = validateLiveReportAcceptance(stringlySummaryReport, {
      expectedVersion: packageJson.version
    });
    expect(stringlySummaryResult.accepted).toBe(false);
    expect(stringlySummaryResult.issues.map((issue) => issue.code)).toContain(
      "live_report_step_contract_mismatch"
    );
    expect(JSON.stringify(stringlySummaryResult.issues)).not.toContain('"1"');

    const statusSkippedReport = acceptedLiveReport({
      steps: acceptedLiveReport().steps.map((step) =>
        step.name === "status"
          ? {
              ...step,
              summary: {
                ...step.summary,
                liveSessionState: "skipped"
              }
            }
          : step
      )
    });
    statusSkippedReport.attempted = summarizeLiveReportAttempts(statusSkippedReport.steps);
    statusSkippedReport.coverage = summarizeLiveReportCoverage(statusSkippedReport.steps);
    statusSkippedReport.missingCoverage = summarizeLiveReportMissingCoverage(
      statusSkippedReport.requested,
      statusSkippedReport.coverage
    );

    expect(
      validateLiveReportAcceptance(statusSkippedReport, {
        expectedVersion: packageJson.version
      })
    ).toEqual({
      accepted: true,
      issues: []
    });

    const freeformStringSummaryReports = [
      acceptedLiveReport({
        steps: acceptedLiveReport().steps.map((step) =>
          step.name === "status"
            ? {
                ...step,
                summary: {
                  ...step.summary,
                  liveSessionState: "Cart page showed Amul Milk 500ml"
                }
              }
            : step
        )
      }),
      acceptedLiveReport({
        steps: acceptedLiveReport().steps.map((step) =>
          step.name === "doctor"
            ? {
                ...step,
                summary: {
                  ...step.summary,
                  warnings: ["Amul Milk 500ml"]
                }
              }
            : step
        )
      })
    ];

    for (const report of freeformStringSummaryReports) {
      report.attempted = summarizeLiveReportAttempts(report.steps);
      report.coverage = summarizeLiveReportCoverage(report.steps);
      report.missingCoverage = summarizeLiveReportMissingCoverage(report.requested, report.coverage);

      const result = validateLiveReportAcceptance(report, {
        expectedVersion: packageJson.version
      });
      expect(result.accepted).toBe(false);
      expect(result.issues.map((issue) => issue.code)).toContain("live_report_step_contract_mismatch");
      expect(JSON.stringify(result.issues)).not.toContain("Amul Milk");
    }

    const inconsistentSummaryReports = [
      acceptedLiveReport({
        steps: acceptedLiveReport().steps.map((step) =>
          step.name === "status"
            ? {
                ...step,
                summary: {
                  ...step.summary,
                  liveSessionState: "logged-in"
                }
              }
            : step
        )
      }),
      acceptedLiveReport({
        steps: acceptedLiveReport().steps.map((step) =>
          step.name === "doctor"
            ? {
                ...step,
                summary: {
                  ...step.summary,
                  failures: ["SQLite"]
                }
              }
            : step
        )
      }),
      acceptedLiveReport({
        steps: [
          ...acceptedLiveReport().steps.slice(0, 3),
          {
            name: "search",
            command: "zepo --data-dir <redacted-data-dir> --visible search <redacted-query> --json",
            exitCode: 0,
            ok: true,
            summary: {
              productCount: 1,
              productDetailCount: 0
            }
          },
          ...acceptedLiveReport().steps.slice(4)
        ]
      }),
      acceptedLiveReport({
        steps: [
          ...acceptedLiveReport().steps.slice(0, 3),
          {
            name: "search",
            command: "zepo --data-dir <redacted-data-dir> --visible search <redacted-query> --json",
            exitCode: 0,
            ok: true,
            summary: {
              productCount: 1,
              productDetailCount: 2
            }
          },
          ...acceptedLiveReport().steps.slice(4)
        ]
      }),
      acceptedLiveReport({
        steps: [
          ...acceptedLiveReport().steps.slice(0, 4),
          {
            name: "add",
            command: "zepo --data-dir <redacted-data-dir> --visible add <redacted-query> --quantity 1 --json",
            exitCode: 0,
            ok: true,
            summary: {
              productAdded: true,
              productHasDetail: false,
              cartItemCount: 1
            }
          },
          ...acceptedLiveReport().steps.slice(4)
        ]
      }),
      acceptedLiveReport({
        steps: [
          ...acceptedLiveReport().steps.slice(0, 3),
          {
            name: "address list",
            command: "zepo --data-dir <redacted-data-dir> --visible address list --json",
            exitCode: 0,
            ok: true,
            summary: {
              addressCount: 1,
              selectedCount: 2,
              hasAddressDetail: true
            }
          },
          ...acceptedLiveReport().steps.slice(3)
        ]
      }),
      acceptedLiveReport({
        requested: summarizeLiveReportRequests({
          search: "milk",
          checkout: true,
          track: true
        }),
        steps: [
          ...acceptedLiveReport().steps,
          {
            name: "track",
            command: "zepo --data-dir <redacted-data-dir> --visible track --json",
            exitCode: 0,
            ok: true,
            summary: {
              orderCount: 0,
              latestHasStatus: true,
              latestHasEta: false
            }
          }
        ]
      }),
      acceptedLiveReport({
        requested: summarizeLiveReportRequests({
          search: "milk",
          checkout: true,
          history: true
        }),
        steps: [
          ...acceptedLiveReport().steps,
          {
            name: "history",
            command: "zepo --data-dir <redacted-data-dir> --visible history --json",
            exitCode: 0,
            ok: true,
            summary: {
              orderCount: 0,
              latestHasStatus: false,
              latestHasEta: true
            }
          }
        ]
      }),
      acceptedLiveReport({
        requested: summarizeLiveReportRequests({
          search: "milk",
          checkout: true,
          history: true
        }),
        steps: [
          ...acceptedLiveReport().steps,
          {
            name: "history",
            command: "zepo --data-dir <redacted-data-dir> --visible history --json",
            exitCode: 0,
            ok: true,
            summary: {
              orderCount: 1,
              latestHasStatus: false,
              latestHasEta: false
            }
          }
        ]
      })
    ];

    for (const report of inconsistentSummaryReports) {
      report.attempted = summarizeLiveReportAttempts(report.steps);
      report.coverage = summarizeLiveReportCoverage(report.steps);
      report.missingCoverage = summarizeLiveReportMissingCoverage(report.requested, report.coverage);

      const result = validateLiveReportAcceptance(report, {
        expectedVersion: packageJson.version
      });
      expect(result.accepted).toBe(false);
      expect(result.issues.map((issue) => issue.code)).toContain("live_report_step_contract_mismatch");
      expect(JSON.stringify(result.issues)).not.toContain("SQLite");
    }

    const oversizedSummaryReport = acceptedLiveReport({
      steps: acceptedLiveReport().steps.map((step) =>
        step.name === "search"
          ? {
              ...step,
              summary: {
                productCount: 51
              }
            }
          : step
      )
    });
    oversizedSummaryReport.attempted = summarizeLiveReportAttempts(oversizedSummaryReport.steps);
    oversizedSummaryReport.coverage = summarizeLiveReportCoverage(oversizedSummaryReport.steps);
    oversizedSummaryReport.missingCoverage = summarizeLiveReportMissingCoverage(
      oversizedSummaryReport.requested,
      oversizedSummaryReport.coverage
    );

    const oversizedSummaryResult = validateLiveReportAcceptance(oversizedSummaryReport, {
      expectedVersion: packageJson.version
    });
    expect(oversizedSummaryResult.accepted).toBe(false);
    expect(oversizedSummaryResult.issues.map((issue) => issue.code)).toContain(
      "live_report_step_contract_mismatch"
    );

    const sensitiveNumberSummaryReport = acceptedLiveReport({
      steps: acceptedLiveReport().steps.map((step) =>
        step.name === "search"
          ? {
              ...step,
              summary: {
                productCount: 9876543210
              }
            }
          : step
      )
    });
    sensitiveNumberSummaryReport.attempted = summarizeLiveReportAttempts(sensitiveNumberSummaryReport.steps);
    sensitiveNumberSummaryReport.coverage = summarizeLiveReportCoverage(sensitiveNumberSummaryReport.steps);
    sensitiveNumberSummaryReport.missingCoverage = summarizeLiveReportMissingCoverage(
      sensitiveNumberSummaryReport.requested,
      sensitiveNumberSummaryReport.coverage
    );

    const sensitiveNumberSummaryResult = validateLiveReportAcceptance(sensitiveNumberSummaryReport, {
      expectedVersion: packageJson.version
    });
    expect(sensitiveNumberSummaryResult.accepted).toBe(false);
    expect(sensitiveNumberSummaryResult.issues.map((issue) => issue.code)).toContain("live_report_sensitive_text");
    expect(sensitiveNumberSummaryResult.issues.map((issue) => issue.code)).toContain(
      "live_report_step_contract_mismatch"
    );
    expect(JSON.stringify(sensitiveNumberSummaryResult.issues)).not.toContain("9876543210");

    const strippedSummaryReport = acceptedLiveReport({
      steps: acceptedLiveReport().steps.map((step) =>
        step.name === "doctor"
          ? {
              ...step,
              summary: {
                ok: true,
                browserAutomationReady: true,
                playwrightChromiumPassed: true
              }
            }
          : step
      )
    });
    strippedSummaryReport.attempted = summarizeLiveReportAttempts(strippedSummaryReport.steps);
    strippedSummaryReport.coverage = summarizeLiveReportCoverage(strippedSummaryReport.steps);
    strippedSummaryReport.missingCoverage = summarizeLiveReportMissingCoverage(
      strippedSummaryReport.requested,
      strippedSummaryReport.coverage
    );

    const strippedSummaryResult = validateLiveReportAcceptance(strippedSummaryReport, {
      expectedVersion: packageJson.version
    });
    expect(strippedSummaryResult.accepted).toBe(false);
    expect(strippedSummaryResult.issues.map((issue) => issue.code)).toContain(
      "live_report_step_contract_mismatch"
    );

    const unrequestedBadCheckoutReport = acceptedLiveReport({
      requested: summarizeLiveReportRequests({
        search: "milk"
      }),
      steps: acceptedLiveReport().steps.map((step) =>
        step.name === "checkout"
          ? {
              ...step,
              summary: {
                ...step.summary,
                cartPrecondition: "non_empty_cart_verified",
                paymentStatus: "paid",
                orderPlacement: "confirmed"
              }
            }
          : step
      )
    });
    unrequestedBadCheckoutReport.attempted = summarizeLiveReportAttempts(unrequestedBadCheckoutReport.steps);
    unrequestedBadCheckoutReport.coverage = summarizeLiveReportCoverage(unrequestedBadCheckoutReport.steps);
    unrequestedBadCheckoutReport.missingCoverage = summarizeLiveReportMissingCoverage(
      unrequestedBadCheckoutReport.requested,
      unrequestedBadCheckoutReport.coverage
    );

    const unrequestedBadCheckoutResult = validateLiveReportAcceptance(unrequestedBadCheckoutReport, {
      expectedVersion: packageJson.version
    });
    expect(unrequestedBadCheckoutResult.accepted).toBe(false);
    expect(unrequestedBadCheckoutResult.issues.map((issue) => issue.code)).toContain(
      "live_report_step_contract_mismatch"
    );
    expect(JSON.stringify(unrequestedBadCheckoutResult.issues)).not.toContain("paid");

    const sensitiveReport = acceptedLiveReport({
      dataDir: "C:\\Users\\parth\\.zepo-live",
      note: `raw token npm_${"A".repeat(24)} should not be accepted`
    });
    const sensitiveResult = validateLiveReportAcceptance(sensitiveReport, {
      expectedVersion: packageJson.version
    });

    expect(sensitiveResult.accepted).toBe(false);
    expect(sensitiveResult.issues.map((issue) => issue.code)).toContain("live_report_sensitive_text");
    expect(JSON.stringify(sensitiveResult.issues)).not.toContain("Users");
    expect(JSON.stringify(sensitiveResult.issues)).not.toContain("npm_");

    const linuxSensitiveReport = acceptedLiveReport({
      metadata: {
        "/root/.zepo-live/report.json": true,
        "/opt/zepocli/.zepto-smoke/trace.txt": true
      }
    });
    const linuxSensitiveResult = validateLiveReportAcceptance(linuxSensitiveReport, {
      expectedVersion: packageJson.version
    });

    expect(linuxSensitiveResult.accepted).toBe(false);
    expect(linuxSensitiveResult.issues.map((issue) => issue.code)).toContain("live_report_sensitive_text");
    expect(JSON.stringify(linuxSensitiveResult.issues)).not.toContain("/root");
    expect(JSON.stringify(linuxSensitiveResult.issues)).not.toContain("/opt");

    const sensitiveKeyReport = acceptedLiveReport({
      metadata: {
        "C:\\Users\\parth\\.zepo-live": true
      }
    });
    const sensitiveKeyResult = validateLiveReportAcceptance(sensitiveKeyReport, {
      expectedVersion: packageJson.version
    });

    expect(sensitiveKeyResult.accepted).toBe(false);
    expect(sensitiveKeyResult.issues.map((issue) => issue.code)).toContain("live_report_sensitive_text");
    expect(JSON.stringify(sensitiveKeyResult.issues)).not.toContain("Users");

    const metadataReports = [
      acceptedLiveReport({ generatedAt: "today" }),
      acceptedLiveReport({ generatedAt: undefined }),
      acceptedLiveReport({ generatedAt: "2999-01-01T00:00:00.000Z" }),
      acceptedLiveReport({ dataDir: "<redacted-local-path>" }),
      acceptedLiveReport({ reportPath: "<redacted-local-path>" }),
      acceptedLiveReport({ note: "Report fixture without the sanitizer note." }),
      acceptedLiveReport({ note: `${LIVE_REPORT_NOTE} Cart item Amul Milk 500ml was observed.` })
    ];

    for (const report of metadataReports) {
      const result = validateLiveReportAcceptance(report, {
        expectedVersion: packageJson.version
      });
      expect(result.accepted).toBe(false);
      expect(result.issues.map((issue) => issue.code)).toContain("live_report_metadata_mismatch");
      expect(JSON.stringify(result.issues)).not.toContain("today");
      expect(JSON.stringify(result.issues)).not.toContain("2999");
      expect(JSON.stringify(result.issues)).not.toContain("Amul Milk");
    }

    const unexpectedTopLevel = acceptedLiveReport({
      rawQuery: "Amul Milk 500ml"
    });
    const unexpectedStep = acceptedLiveReport({
      steps: acceptedLiveReport().steps.map((step) =>
        step.name === "search" ? { ...step, rawPayload: "Amul Milk 500ml" } : step
      )
    });
    const unexpectedSummary = acceptedLiveReport({
      steps: acceptedLiveReport().steps.map((step) =>
        step.name === "checkout"
          ? { ...step, summary: { ...step.summary, rawPageText: "Amul Milk 500ml" } }
          : step
      )
    });

    for (const report of [unexpectedTopLevel, unexpectedStep, unexpectedSummary]) {
      const result = validateLiveReportAcceptance(report, {
        expectedVersion: packageJson.version
      });
      expect(result.accepted).toBe(false);
      expect(result.issues.map((issue) => issue.code)).toContain("live_report_unexpected_field");
      expect(JSON.stringify(result.issues)).not.toContain("Amul Milk");
    }

    const rawCommandReports = [
      acceptedLiveReport({
        steps: acceptedLiveReport().steps.map((step) =>
          step.name === "search"
            ? { ...step, command: "zepo --data-dir <redacted-data-dir> --visible search Amul Milk 500ml --json" }
            : step
        )
      }),
      acceptedLiveReport({
        steps: [
          ...acceptedLiveReport().steps,
          {
            name: "add",
            command: "zepo --data-dir <redacted-data-dir> --visible add protein bars --quantity 1 --json",
            exitCode: 1,
            ok: false,
            error: {
              code: "command_failed",
              message: "failed"
            }
          }
        ]
      }),
      acceptedLiveReport({
        steps: [
          ...acceptedLiveReport().steps,
          {
            name: "address use",
            command: "zepo --data-dir <redacted-data-dir> --visible address use home --json",
            exitCode: 1,
            ok: false,
            error: {
              code: "command_failed",
              message: "failed"
            }
          }
        ]
      }),
      acceptedLiveReport({
        steps: [
          ...acceptedLiveReport().steps,
          {
            name: "remove",
            command: "zepo --data-dir <redacted-data-dir> --visible remove chips --json",
            exitCode: 1,
            ok: false,
            error: {
              code: "command_failed",
              message: "failed"
            }
          }
        ]
      })
    ];

    for (const report of rawCommandReports) {
      const result = validateLiveReportAcceptance(report, {
        expectedVersion: packageJson.version
      });
      expect(result.accepted).toBe(false);
      expect(result.issues.map((issue) => issue.code)).toContain("live_report_command_mismatch");
      expect(JSON.stringify(result.issues)).not.toContain("Amul Milk");
      expect(JSON.stringify(result.issues)).not.toContain("protein bars");
      expect(JSON.stringify(result.issues)).not.toContain("chips");
    }

    const missingCommandReport = acceptedLiveReport({
      steps: acceptedLiveReport().steps.map((step) =>
        step.name === "search"
          ? {
              name: step.name,
              exitCode: step.exitCode,
              ok: step.ok,
              summary: step.summary
            }
          : step
      )
    });

    expect(
      validateLiveReportAcceptance(missingCommandReport, {
        expectedVersion: packageJson.version
      }).issues.map((issue) => issue.code)
    ).toContain("live_report_command_mismatch");

    const manualPartialReport = acceptedLiveReport({
      ok: false,
      steps: [
        ...acceptedLiveReport().steps,
        {
          name: "session precondition",
          command: "manual",
          exitCode: 1,
          ok: false,
          error: {
            code: "live_verification_incomplete",
            message: "No confirmed Zepto session is available."
          }
        }
      ]
    });

    const manualPartialReportIssueCodes = validateLiveReportAcceptance(manualPartialReport, {
      expectedVersion: packageJson.version
    }).issues.map((issue) => issue.code);
    expect(manualPartialReportIssueCodes).not.toContain("live_report_command_mismatch");
    expect(manualPartialReportIssueCodes).not.toContain("live_report_error_mismatch");

    const editedManualWorkflowStepReport = acceptedLiveReport({
      ok: false,
      steps: [
        ...acceptedLiveReport().steps,
        {
          name: "login",
          command: "manual",
          exitCode: 1,
          ok: false,
          error: {
            code: "live_verification_incomplete",
            message: "No confirmed Zepto session is available."
          }
        }
      ]
    });

    expect(
      validateLiveReportAcceptance(editedManualWorkflowStepReport, {
        expectedVersion: packageJson.version
      }).issues.map((issue) => issue.code)
    ).toContain("live_report_command_mismatch");

    const editedInternalWorkflowStepReport = acceptedLiveReport({
      ok: false,
      steps: [
        ...acceptedLiveReport().steps,
        {
          name: "cart",
          command: "internal",
          exitCode: 1,
          ok: false,
          error: {
            code: "live_runner_failed",
            message: "Runner failed."
          }
        }
      ]
    });

    expect(
      validateLiveReportAcceptance(editedInternalWorkflowStepReport, {
        expectedVersion: packageJson.version
      }).issues.map((issue) => issue.code)
    ).toContain("live_report_command_mismatch");

    const malformedStepResultReports = [
      acceptedLiveReport({
        steps: acceptedLiveReport().steps.map((step) =>
          step.name === "search"
            ? {
                name: step.name,
                command: step.command,
                ok: step.ok,
                summary: step.summary
              }
            : step
        )
      }),
      acceptedLiveReport({
        steps: acceptedLiveReport().steps.map((step) =>
          step.name === "search"
            ? {
                ...step,
                exitCode: 1
              }
            : step
        )
      }),
      acceptedLiveReport({
        steps: acceptedLiveReport().steps.map((step) =>
          step.name === "search"
            ? {
                ...step,
                error: {
                  code: "command_failed",
                  message: "failed"
                }
              }
            : step
        )
      }),
      acceptedLiveReport({
        steps: [
          ...acceptedLiveReport().steps,
          {
            name: "add",
            command: "zepo --data-dir <redacted-data-dir> --visible add <redacted-query> --quantity 1 --json",
            exitCode: 1,
            ok: false
          }
        ]
      }),
      acceptedLiveReport({
        steps: [
          ...acceptedLiveReport().steps,
          {
            name: "add",
            command: "zepo --data-dir <redacted-data-dir> --visible add <redacted-query> --quantity 1 --json",
            exitCode: 0,
            ok: false,
            error: {
              code: "command_failed",
              message: "failed"
            }
          }
        ]
      })
    ];

    for (const report of malformedStepResultReports) {
      const result = validateLiveReportAcceptance(report, {
        expectedVersion: packageJson.version
      });
      expect(result.accepted).toBe(false);
      expect(result.issues.map((issue) => issue.code)).toContain("live_report_step_result_mismatch");
      expect(JSON.stringify(result.issues)).not.toContain("failed");
    }

    const malformedErrorReports = [
      acceptedLiveReport({
        ok: false,
        steps: [
          ...acceptedLiveReport().steps,
          {
            name: "cart",
            command: "zepo --data-dir <redacted-data-dir> --visible cart --json",
            exitCode: 1,
            ok: false,
            error: {
              code: "not_a_stable_code",
              message: "failed"
            }
          }
        ]
      }),
      acceptedLiveReport({
        ok: false,
        steps: [
          ...acceptedLiveReport().steps,
          {
            name: "cart",
            command: "zepo --data-dir <redacted-data-dir> --visible cart --json",
            exitCode: 1,
            ok: false,
            error: {
              code: "command_failed",
              message: ""
            }
          }
        ]
      }),
      acceptedLiveReport({
        ok: false,
        steps: [
          ...acceptedLiveReport().steps,
          {
            name: "cart",
            command: "zepo --data-dir <redacted-data-dir> --visible cart --json",
            exitCode: 1,
            ok: false,
            error: {
              code: "command_failed",
              message: "failed",
              hint: 123
            }
          }
        ]
      }),
      acceptedLiveReport({
        ok: false,
        steps: [
          ...acceptedLiveReport().steps,
          {
            name: "cart",
            command: "zepo --data-dir <redacted-data-dir> --visible cart --json",
            exitCode: 1,
            ok: false,
            error: {
              code: "zepto_access_cooldown",
              message: "cooling down",
              retryAfterMs: -1
            }
          }
        ]
      }),
      acceptedLiveReport({
        ok: false,
        steps: [
          ...acceptedLiveReport().steps,
          {
            name: "cart",
            command: "zepo --data-dir <redacted-data-dir> --visible cart --json",
            exitCode: 1,
            ok: false,
            error: {
              code: "zepto_access_cooldown",
              message: "cooling down",
              retryAfterMs: 3_600_001
            }
          }
        ]
      })
    ];

    for (const report of malformedErrorReports) {
      report.attempted = summarizeLiveReportAttempts(report.steps);
      report.coverage = summarizeLiveReportCoverage(report.steps);
      report.missingCoverage = summarizeLiveReportMissingCoverage(report.requested, report.coverage);

      const result = validateLiveReportAcceptance(report, {
        expectedVersion: packageJson.version
      });
      expect(result.accepted).toBe(false);
      expect(result.issues.map((issue) => issue.code)).toContain("live_report_error_mismatch");
      expect(JSON.stringify(result.issues)).not.toContain("not_a_stable_code");
      expect(JSON.stringify(result.issues)).not.toContain("failed");
      expect(JSON.stringify(result.issues)).not.toContain("cooling down");
    }

    const weakDoctor = acceptedLiveReport({
      steps: [
        {
          name: "doctor",
          command: "zepo --data-dir <redacted-data-dir> doctor --json",
          exitCode: 0,
          ok: true,
          summary: {
            ok: true,
            browserAutomationReady: true,
            playwrightChromiumPassed: false
          }
        },
        ...acceptedLiveReport().steps.slice(1)
      ]
    });

    expect(
      validateLiveReportAcceptance(weakDoctor, {
        expectedVersion: packageJson.version
      }).issues.map((issue) => issue.code)
    ).toContain("live_report_step_contract_mismatch");
  });

  it("validates saved live report files without echoing local paths", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "zepo-live-report-"));
    try {
      const reportPath = join(tempDir, "live-verification-report.json");
      writeFileSync(reportPath, `${JSON.stringify(acceptedLiveReport(), null, 2)}\n`);

      const pass = spawnSync(process.execPath, [reportScriptPath, reportPath], {
        cwd: rootDir,
        encoding: "utf8"
      });

      expect(pass.status).toBe(0);
      expect(pass.stdout).toContain("pass live verification report acceptance");
      expect(`${pass.stdout}\n${pass.stderr}`).not.toContain(tempDir);

      const staleReportPath = join(tempDir, "stale-live-verification-report.json");
      writeFileSync(
        staleReportPath,
        `${JSON.stringify(
          acceptedLiveReport({
            generatedAt: new Date(Date.now() - 2 * 60 * 60 * 1_000).toISOString()
          }),
          null,
          2
        )}\n`
      );
      const staleFail = spawnSync(process.execPath, [reportScriptPath, "--max-age-minutes", "60", staleReportPath], {
        cwd: rootDir,
        encoding: "utf8"
      });

      expect(staleFail.status).toBe(1);
      expect(staleFail.stderr).toContain("live_report_stale");
      expect(`${staleFail.stdout}\n${staleFail.stderr}`).not.toContain(tempDir);

      const freshReportPath = join(tempDir, "fresh-live-verification-report.json");
      writeFileSync(
        freshReportPath,
        `${JSON.stringify(acceptedLiveReport({ generatedAt: new Date().toISOString() }), null, 2)}\n`
      );
      const freshPass = spawnSync(process.execPath, [reportScriptPath, "--max-age-minutes", "60", freshReportPath], {
        cwd: rootDir,
        encoding: "utf8"
      });

      expect(freshPass.status).toBe(0);
      expect(freshPass.stdout).toContain("pass live verification report acceptance");
      expect(`${freshPass.stdout}\n${freshPass.stderr}`).not.toContain(tempDir);

      const partialScopeFail = spawnSync(
        process.execPath,
        [reportScriptPath, "--require-production-scope", "--max-age-minutes", "60", reportPath],
        {
          cwd: rootDir,
          encoding: "utf8"
        }
      );

      expect(partialScopeFail.status).toBe(1);
      expect(partialScopeFail.stderr).toContain("live_report_production_scope_missing");
      expect(`${partialScopeFail.stdout}\n${partialScopeFail.stderr}`).not.toContain(tempDir);

      const productionReportPath = join(tempDir, "production-live-verification-report.json");
      writeFileSync(
        productionReportPath,
        `${JSON.stringify(productionScopeLiveReport({ generatedAt: new Date().toISOString() }), null, 2)}\n`
      );

      const productionFreshnessFail = spawnSync(
        process.execPath,
        [reportScriptPath, "--require-production-scope", productionReportPath],
        {
          cwd: rootDir,
          encoding: "utf8"
        }
      );

      expect(productionFreshnessFail.status).toBe(1);
      expect(productionFreshnessFail.stderr).toContain("live_report_production_scope_freshness_missing");
      expect(`${productionFreshnessFail.stdout}\n${productionFreshnessFail.stderr}`).not.toContain(tempDir);

      const productionPass = spawnSync(
        process.execPath,
        [reportScriptPath, "--require-production-scope", "--max-age-minutes", "60", productionReportPath],
        {
          cwd: rootDir,
          encoding: "utf8"
        }
      );

      expect(productionPass.status).toBe(0);
      expect(productionPass.stdout).toContain("pass live verification report acceptance");
      expect(`${productionPass.stdout}\n${productionPass.stderr}`).not.toContain(tempDir);

      const badMaxAge = spawnSync(process.execPath, [reportScriptPath, "--max-age-minutes", "0", reportPath], {
        cwd: rootDir,
        encoding: "utf8"
      });

      expect(badMaxAge.status).toBe(1);
      expect(badMaxAge.stderr).toContain("--max-age-minutes must be an integer from 1 to 10080.");
      expect(`${badMaxAge.stdout}\n${badMaxAge.stderr}`).not.toContain(tempDir);

      const badReportPath = join(tempDir, "bad-live-verification-report.json");
      writeFileSync(
        badReportPath,
        `${JSON.stringify(
          acceptedLiveReport({
            ok: false,
            version: "0.0.0"
          }),
          null,
          2
        )}\n`
      );

      const fail = spawnSync(process.execPath, [reportScriptPath, badReportPath], {
        cwd: rootDir,
        encoding: "utf8"
      });

      expect(fail.status).toBe(1);
      expect(fail.stderr).toContain("Live verification report is not acceptable.");
      expect(fail.stderr).toContain("live_report_not_ok");
      expect(fail.stderr).toContain("live_report_version_mismatch");
      expect(`${fail.stdout}\n${fail.stderr}`).not.toContain(tempDir);

      const sensitiveReportPath = join(tempDir, "sensitive-live-verification-report.json");
      writeFileSync(
        sensitiveReportPath,
        `${JSON.stringify(
          acceptedLiveReport({
            reportPath: join(tempDir, "live-verification-report.json"),
            metadata: {
              [join(tempDir, "raw-report-key")]: true
            }
          }),
          null,
          2
        )}\n`
      );

      const sensitiveFail = spawnSync(process.execPath, [reportScriptPath, sensitiveReportPath], {
        cwd: rootDir,
        encoding: "utf8"
      });

      expect(sensitiveFail.status).toBe(1);
      expect(sensitiveFail.stderr).toContain("live_report_sensitive_text");
      expect(`${sensitiveFail.stdout}\n${sensitiveFail.stderr}`).not.toContain(tempDir);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }, LIVE_VERIFIER_TEST_TIMEOUT_MS);

  it("summarizes requested but uncovered live report capabilities", () => {
    const requested = summarizeLiveReportRequests({
      login: true,
      search: "milk",
      checkout: true,
      history: true
    });
    const coverage = summarizeLiveReportCoverage([
      { name: "doctor", ok: true },
      { name: "status", ok: true },
      { name: "login", ok: false },
      { name: "search", ok: true },
      { name: "checkout", ok: true }
    ]);

    const missingCoverage = summarizeLiveReportMissingCoverage(requested, coverage);

    expect(missingCoverage).toEqual({
      browserPreflight: false,
      localStatus: false,
      login: true,
      liveSession: true,
      search: false,
      addressAdd: false,
      addressList: false,
      addressUse: false,
      add: false,
      cart: false,
      remove: false,
      clear: false,
      checkoutHandoff: false,
      track: false,
      history: true,
      reorder: false
    });
    expect(hasLiveReportMissingCoverage(missingCoverage)).toBe(true);
    expect(hasLiveReportMissingCoverage(summarizeLiveReportMissingCoverage(requested, requested))).toBe(false);
  });

  it("redacts the final live report path in runner console output", () => {
    const script = readFileSync(scriptPath, "utf8");

    expect(script).toContain("Live verification report: <redacted-report-path>");
    expect(script).not.toContain("Live verification report: ${reportPath}");
  });

  it("redacts child command stderr before streaming it from live verification", () => {
    const script = readFileSync(scriptPath, "utf8");

    expect(script).toContain("createLiveConsoleTextRedactor");
    expect(script).toContain("stderrRedactor.write(chunk)");
    expect(script).toContain("stderrRedactor.flush()");
    expect(script).toContain("shouldStreamLiveStderrImmediately");
  });

  it("does not pass npm publish credentials to live child commands", () => {
    const script = readFileSync(scriptPath, "utf8");

    expect(script).toContain('import { sanitizedChildEnv } from "./env-utils.mjs"');
    expect(script).toContain("env: sanitizedChildEnv(process.env");
  });

  it("sanitizes live report write failures instead of throwing raw filesystem errors", () => {
    const script = readFileSync(scriptPath, "utf8");

    expect(script).toContain("const reportWriteError = writeLiveReport(reportPath, report)");
    expect(script).toContain("Could not write live verification report.");
    expect(script).toContain("Choose a writable report file path and rerun with --report <path>.");
    expect(script).toContain("function writeLiveReport(path, payload)");
    expect(script).not.toContain("console.error(error.message)");
    expect(script).not.toContain("writeFileSync(reportPath, `${JSON.stringify(report");
  });

  it("records sanitized reports for internal live runner failures", () => {
    const script = readFileSync(scriptPath, "utf8");

    expect(script).toContain("summarizeLiveRunnerFailure(error)");
    expect(script).toContain('name: "live runner"');
    expect(script).toContain("Live verification runner failed before completing all requested steps.");
  });

  it("requires an explicit data directory before touching the compiled CLI", () => {
    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: rootDir,
      encoding: "utf8"
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Missing required --data-dir <path>.");
  });

  it("redacts unknown live verification arguments before touching the compiled CLI", () => {
    const fakeNpmToken = `npm_${"A".repeat(24)}`;
    const cases = [
      {
        args: [`--bad-${fakeNpmToken}`],
        expected: "Unknown option: --bad-<redacted-npm-token>.",
        hidden: [fakeNpmToken]
      },
      {
        args: ["--search=Amul Milk 500ml"],
        expected: "Unknown option: --search.",
        hidden: ["Amul Milk 500ml"]
      },
      {
        args: ["--report=C:\\Users\\parth\\.zepo-live\\secret-report.json"],
        expected: "Unknown option: --report.",
        hidden: ["C:\\Users\\parth", "secret-report.json"]
      },
      {
        args: ["protein bars"],
        expected: "Unexpected positional argument.",
        hidden: ["protein bars"]
      }
    ];

    for (const testCase of cases) {
      const result = spawnSync(process.execPath, [scriptPath, ...testCase.args], {
        cwd: rootDir,
        encoding: "utf8"
      });
      const output = `${result.stdout}\n${result.stderr}`;

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(testCase.expected);
      expect(result.stderr).toContain("Run `npm --silent run verify:live -- --help` for supported options.");
      expect(result.stderr).not.toContain("Compiled CLI was not found");
      for (const hidden of testCase.hidden) {
        expect(output).not.toContain(hidden);
      }
    }
  }, LIVE_VERIFIER_TEST_TIMEOUT_MS);

  it("rejects live verification option combinations that cannot produce useful evidence", () => {
    const clearCheckout = spawnSync(
      process.execPath,
      [scriptPath, "--data-dir", ".zepo-live", "--clear", "--checkout"],
      {
        cwd: rootDir,
        encoding: "utf8"
      }
    );

    expect(clearCheckout.status).toBe(1);
    expect(clearCheckout.stderr).toContain("--clear cannot be combined with --checkout");

    const phoneWithoutLogin = spawnSync(process.execPath, [scriptPath, "--data-dir", ".zepo-live", "--phone", "9999999999"], {
      cwd: rootDir,
      encoding: "utf8"
    });

    expect(phoneWithoutLogin.status).toBe(1);
    expect(phoneWithoutLogin.stderr).toContain("--phone can only be used with --login.");

    const quantityWithoutAdd = spawnSync(process.execPath, [scriptPath, "--data-dir", ".zepo-live", "--quantity", "2"], {
      cwd: rootDir,
      encoding: "utf8"
    });

    expect(quantityWithoutAdd.status).toBe(1);
    expect(quantityWithoutAdd.stderr).toContain("--quantity can only be used with --add.");

    const chooseWithoutAdd = spawnSync(process.execPath, [scriptPath, "--data-dir", ".zepo-live", "--choose-add"], {
      cwd: rootDir,
      encoding: "utf8"
    });

    expect(chooseWithoutAdd.status).toBe(1);
    expect(chooseWithoutAdd.stderr).toContain("--choose-add can only be used with --add.");

    const checkoutWaitWithoutCheckout = spawnSync(
      process.execPath,
      [scriptPath, "--data-dir", ".zepo-live", "--checkout-wait"],
      {
        cwd: rootDir,
        encoding: "utf8"
      }
    );

    expect(checkoutWaitWithoutCheckout.status).toBe(1);
    expect(checkoutWaitWithoutCheckout.stderr).toContain("--checkout-wait can only be used with --checkout or --production-scope.");

    const checkoutRemoveLimitWithoutCheckout = spawnSync(
      process.execPath,
      [scriptPath, "--data-dir", ".zepo-live", "--checkout-remove-limit-items"],
      {
        cwd: rootDir,
        encoding: "utf8"
      }
    );

    expect(checkoutRemoveLimitWithoutCheckout.status).toBe(1);
    expect(checkoutRemoveLimitWithoutCheckout.stderr).toContain(
      "--checkout-remove-limit-items can only be used with --checkout or --production-scope."
    );

    const addressAndList = spawnSync(
      process.execPath,
      [scriptPath, "--data-dir", ".zepo-live", "--address", "home", "--address-list"],
      {
        cwd: rootDir,
        encoding: "utf8"
      }
    );

    expect(addressAndList.status).toBe(1);
    expect(addressAndList.stderr).toContain("--address cannot be combined with --address-list");

    const missingProductionScopeInputs = spawnSync(
      process.execPath,
      [scriptPath, "--data-dir", ".zepo-live", "--production-scope"],
      {
        cwd: rootDir,
        encoding: "utf8"
      }
    );

    expect(missingProductionScopeInputs.status).toBe(1);
    expect(missingProductionScopeInputs.stderr).toContain(
      "--production-scope requires --search <query>, --address <query>, and --add <query>."
    );
    expect(missingProductionScopeInputs.stderr).not.toContain("Compiled CLI was not found");

    const destructiveProductionScope = spawnSync(
      process.execPath,
      [
        scriptPath,
        "--data-dir",
        ".zepo-live",
        "--production-scope",
        "--search",
        "milk",
        "--address",
        "home",
        "--add",
        "milk",
        "--remove",
        "milk"
      ],
      {
        cwd: rootDir,
        encoding: "utf8"
      }
    );

    expect(destructiveProductionScope.status).toBe(1);
    expect(destructiveProductionScope.stderr).toContain(
      "--production-scope cannot be combined with --address-add, --address-list, --remove, --clear, --history, or --reorder-last."
    );
    expect(destructiveProductionScope.stderr).toContain(
      "Run those focused live verifications separately so final production-scope evidence stays clear."
    );
    expect(destructiveProductionScope.stderr).not.toContain("Compiled CLI was not found");
  }, LIVE_VERIFIER_TEST_TIMEOUT_MS);

  it("rejects malformed live verification quantities before touching the compiled CLI", () => {
    for (const quantity of ["2abc", "2.5", "0", "13"]) {
      const result = spawnSync(
        process.execPath,
        [scriptPath, "--data-dir", ".zepo-live", "--add", "milk", "--quantity", quantity],
        {
          cwd: rootDir,
          encoding: "utf8"
        }
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("--quantity must be an integer from 1 to 12.");
      expect(result.stderr).not.toContain("Compiled CLI was not found");
    }
  }, LIVE_VERIFIER_TEST_TIMEOUT_MS);

  it("rejects malformed live verification step timeouts before touching the compiled CLI", () => {
    for (const timeout of ["abc", "1e3", "999", "3600001"]) {
      const result = spawnSync(
        process.execPath,
        [scriptPath, "--data-dir", ".zepo-live", "--step-timeout", timeout],
        {
          cwd: rootDir,
          encoding: "utf8"
        }
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("--step-timeout must be an integer from 1000 to 3600000 ms.");
      expect(result.stderr).not.toContain("Compiled CLI was not found");
    }
  }, LIVE_VERIFIER_TEST_TIMEOUT_MS);

  it("rejects malformed live verification browser context options before touching the compiled CLI", () => {
    for (const testCase of [
      {
        args: ["--data-dir", ".zepo-live", "--browser-locale", "not_a_locale"],
        message: "--browser-locale must be a valid BCP 47 locale."
      },
      {
        args: ["--data-dir", ".zepo-live", "--browser-timezone", "Mars/Olympus"],
        message: "--browser-timezone must be a valid IANA time zone."
      }
    ]) {
      const result = spawnSync(process.execPath, [scriptPath, ...testCase.args], {
        cwd: rootDir,
        encoding: "utf8"
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(testCase.message);
      expect(result.stderr).not.toContain("Compiled CLI was not found");
    }
  }, LIVE_VERIFIER_TEST_TIMEOUT_MS);

  it("accepts CLI-supported live verification browser context options before touching the compiled CLI", () => {
    const result = spawnSync(
      process.execPath,
      [
        scriptPath,
        "--data-dir",
        ".zepo-live",
        "--browser-locale",
        "hi-in",
        "--browser-timezone",
        "utc",
        "--quantity",
        "2"
      ],
      {
        cwd: rootDir,
        encoding: "utf8"
      }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--quantity can only be used with --add.");
    expect(result.stderr).not.toContain("--browser-locale must be a valid");
    expect(result.stderr).not.toContain("--browser-timezone must be a valid");
    expect(result.stderr).not.toContain("Compiled CLI was not found");
  }, LIVE_VERIFIER_TEST_TIMEOUT_MS);

  it("rejects malformed live verification phone input before touching the compiled CLI", () => {
    for (const phone of ["abc", "phone 9876543210", "9876543210 ext 1", "1234567890", "99999", "99999999999"]) {
      const result = spawnSync(
        process.execPath,
        [scriptPath, "--data-dir", ".zepo-live", "--login", "--phone", phone],
        {
          cwd: rootDir,
          encoding: "utf8"
        }
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("--phone must be a valid Indian mobile number.");
      expect(result.stderr).not.toContain("Compiled CLI was not found");
    }
  }, LIVE_VERIFIER_TEST_TIMEOUT_MS);

  it("accepts CLI-supported live verification phone formats before touching the compiled CLI", () => {
    for (const phone of ["9876543210", "+91 98765 43210", "+91-98765-43210", "09876543210"]) {
      const result = spawnSync(
        process.execPath,
        [scriptPath, "--data-dir", ".zepo-live", "--login", "--phone", phone, "--quantity", "2"],
        {
          cwd: rootDir,
          encoding: "utf8"
        }
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("--quantity can only be used with --add.");
      expect(result.stderr).not.toContain("--phone must be a valid");
      expect(result.stderr).not.toContain("Compiled CLI was not found");
    }
  }, LIVE_VERIFIER_TEST_TIMEOUT_MS);

  it("rejects blank live verification option values before touching the compiled CLI", () => {
    for (const testCase of [
      { args: ["--data-dir", "   "], message: "--data-dir requires a non-empty value." },
      { args: ["--data-dir", ".zepo-live", "--search", "   "], message: "--search requires a non-empty value." },
      { args: ["--data-dir", ".zepo-live", "--add", "   "], message: "--add requires a non-empty value." },
      { args: ["--data-dir", ".zepo-live", "--address", "   "], message: "--address requires a non-empty value." },
      { args: ["--data-dir", ".zepo-live", "--remove", "   "], message: "--remove requires a non-empty value." },
      { args: ["--data-dir", ".zepo-live", "--report", "   "], message: "--report requires a non-empty value." },
      { args: ["--data-dir", ".zepo-live", "--browser-locale", "   "], message: "--browser-locale requires a non-empty value." },
      {
        args: ["--data-dir", ".zepo-live", "--browser-timezone", "   "],
        message: "--browser-timezone requires a non-empty value."
      }
    ]) {
      const result = spawnSync(process.execPath, [scriptPath, ...testCase.args], {
        cwd: rootDir,
        encoding: "utf8"
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(testCase.message);
      expect(result.stderr).not.toContain("Compiled CLI was not found");
    }
  }, LIVE_VERIFIER_TEST_TIMEOUT_MS);

  it("parses final JSON after prompt output on stderr", () => {
    const mixedStderr = [
      "? Press enter after the Zepto-side flow is complete.",
      "  You can keep payment inside Zepto.",
      "{",
      '  "ok": false,',
      '  "error": {',
      '    "type": "user_error",',
      '    "code": "zepto_access_cooldown",',
      '    "message": "Recent Zepto verification or block was detected; pausing headless browser automation.",',
      '    "hint": "Use --visible after the cooldown.",',
      '    "exitCode": 1,',
      '    "retryAfterMs": 120000',
      "  }",
      "}"
    ].join("\n");

    expect(parseJsonFromOutput(mixedStderr)).toMatchObject({
      ok: false,
      error: {
        code: "zepto_access_cooldown",
        retryAfterMs: 120000
      }
    });
  });

  it("keeps live report errors stable and sanitized", () => {
    const mixedStderr = [
      "? Press enter after the Zepto-side flow is complete.",
      "{",
      '  "ok": false,',
      '  "error": {',
      '    "type": "user_error",',
      '    "code": "no_confirmed_session",',
      '    "message": "No confirmed Zepto session found.",',
      '    "hint": "Run `zepo --visible login` first.",',
      '    "exitCode": 1',
      "  }",
      "}"
    ].join("\n");
    const parsed = parseJsonFromOutput(mixedStderr);

    expect(summarizeCommandError(parsed?.error, mixedStderr)).toEqual({
      code: "no_confirmed_session",
      message: "No confirmed Zepto session found.",
      hint: "Run `zepo --visible login` first."
    });
  });

  it("preserves retry timing for access-challenge live report failures", () => {
    const { step, payload } = buildLiveReportStep({
      name: "search",
      args: ["--data-dir", ".zepo-live", "--visible", "search", "milk", "--json"],
      status: 1,
      stdout: "",
      stderr: JSON.stringify({
        ok: false,
        error: {
          type: "user_error",
          code: "zepto_access_challenge",
          message: "Zepto returned HTTP 429 from https://www.zepto.com/api/search?query=milk.",
          hint: "Stop repeated automation and retry milk later.",
          exitCode: 1,
          retryAfterMs: 900_000
        }
      }),
      summarizePayload: () => ({ unsafe: true })
    });

    expect(payload).toBeUndefined();
    expect(step).toEqual({
      name: "search",
      command: "zepo --data-dir <redacted-data-dir> --visible search <redacted-query> --json",
      exitCode: 1,
      ok: false,
      error: {
        code: "zepto_access_challenge",
        message: "Zepto returned HTTP 429 from https://www.zepto.com/api/search?query=<redacted-query>.",
        hint: "Stop repeated automation and retry <redacted-query> later.",
        retryAfterMs: 900_000
      }
    });
  });

  it("accepts visible doctor and local-status preflight commands for visible live workflows", () => {
    const summarizeVisiblePreflightPayload = (
      name: string,
      payload: { ok?: boolean; checks?: Array<{ name?: string; status?: string }>; confirmedSession?: boolean; browserAutomation?: { ready?: boolean } }
    ) => {
      if (name === "doctor") {
        const checks = Array.isArray(payload.checks) ? payload.checks : [];
        return {
          ok: payload.ok === true,
          browserAutomationReady: payload.browserAutomation?.ready === true,
          playwrightChromiumPassed: checks.some((check) => check.name === "Playwright Chromium" && check.status === "pass"),
          warnings: checks.filter((check) => check.status === "warn").map((check) => check.name),
          failures: checks.filter((check) => check.status === "fail").map((check) => check.name)
        };
      }

      return {
        confirmedSession: payload.confirmedSession === true,
        browserAutomationReady: payload.browserAutomation?.ready === true
      };
    };

    const doctor = buildLiveReportStep({
      name: "doctor",
      args: ["--data-dir", ".zepo-live", "--visible", "doctor", "--json"],
      status: 0,
      stdout: JSON.stringify({
        ok: true,
        ...automationDiagnosticsPayload({ current: "visible_human_controlled", visibleRequested: true }),
        checks: [{ name: "Playwright Chromium", status: "pass" }]
      }),
      stderr: "",
      summarizePayload: summarizeVisiblePreflightPayload
    }).step;
    const status = buildLiveReportStep({
      name: "status",
      args: ["--data-dir", ".zepo-live", "--visible", "status", "--json"],
      status: 0,
      stdout: JSON.stringify({
        confirmedSession: true,
        ...statusDiagnosticsPayload({ current: "visible_human_controlled", visibleRequested: true })
      }),
      stderr: "",
      summarizePayload: summarizeVisiblePreflightPayload
    }).step;

    expect(doctor).toMatchObject({
      command: "zepo --data-dir <redacted-data-dir> --visible doctor --json",
      ok: true
    });
    expect(status).toMatchObject({
      command: "zepo --data-dir <redacted-data-dir> --visible status --json",
      ok: true
    });
  });

  it("summarizes internal live runner failures without storing sensitive text", () => {
    expect(
      summarizeLiveRunnerFailure(
        new Error("Runner crashed near C:\\Users\\parth\\.zepo-live\\trace.txt with OTP 123456 and card 4111 1111 1111 1111.")
      )
    ).toEqual({
      code: "live_runner_failed",
      message:
        "Runner crashed near <redacted-local-path> with OTP <redacted-verification-code> and card <redacted-payment-number>."
    });
  });

  it("builds sanitized live report steps for command launch failures", () => {
    expect(
      buildLiveCommandLaunchFailureStep(
        "add",
        ["--data-dir", "C:\\Users\\parth\\.zepo-live", "--visible", "add", "Amul Milk 500ml", "--json"],
        new Error("spawn failed near C:\\Users\\parth\\.zepo-live\\trace.txt with OTP 123456.")
      )
    ).toEqual({
      name: "add",
      command: "zepo --data-dir <redacted-data-dir> --visible add <redacted-query> --json",
      exitCode: 1,
      ok: false,
      error: {
        code: "live_command_launch_failed",
        message: "spawn failed near <redacted-data-dir> with OTP <redacted-verification-code>."
      }
    });
  });

  it("builds sanitized live report steps for command timeouts", () => {
    const step = buildLiveCommandTimeoutStep(
      "checkout",
      ["--data-dir", "C:\\Users\\parth\\.zepo-live", "--visible", "checkout", "--json"],
      1_000
    );

    expect(step).toMatchObject({
      name: "checkout",
      command: "zepo --data-dir <redacted-data-dir> --visible checkout --json",
      exitCode: 1,
      ok: false,
      error: {
        code: "live_command_timeout",
        message: "Command timed out after 1000 ms.",
        hint: "Increase --step-timeout only when a human-controlled Zepto step legitimately needs more time."
      }
    });
    expect(JSON.stringify(step)).not.toContain("parth");
  });

  it("preserves structured CLI errors emitted by timed-out live commands", () => {
    const step = buildLiveCommandTimeoutOrErrorStep({
      name: "status live",
      args: ["--data-dir", "C:\\Users\\parth\\.zepo-live", "--visible", "status", "--live", "--json"],
      timeoutMs: 120_000,
      stdout: "",
      stderr: JSON.stringify({
        ok: false,
        error: {
          code: "zepto_access_challenge",
          message: "Zepto returned HTTP 429 from https://www.zepto.com/.",
          hint: "Stop repeated automation and open the flow with `--visible`.",
          retryAfterMs: 900000
        }
      })
    });

    expect(step).toEqual({
      name: "status live",
      command: "zepo --data-dir <redacted-data-dir> --visible status --live --json",
      exitCode: 1,
      ok: false,
      error: {
        code: "zepto_access_challenge",
        message: "Zepto returned HTTP 429 from https://www.zepto.com/.",
        hint: "Stop repeated automation and open the flow with `--visible`.",
        retryAfterMs: 900000
      }
    });
    expect(JSON.stringify(step)).not.toContain("parth");
  });

  it("falls back to stable live report error fields for malformed JSON errors", () => {
    expect(
      summarizeCommandError(
        {
          message: "",
          hint: "",
          retryAfterMs: "900000"
        },
        'Could not add "Amul Milk 500ml" from C:\\Users\\parth\\.zepo-live\\run.log',
        ["--data-dir", "C:\\Users\\parth\\.zepo-live", "--visible", "add", "Amul Milk 500ml", "--json"]
      )
    ).toEqual({
      code: "command_failed",
      message: 'Could not add "<redacted-query>" from <redacted-data-dir>'
    });
  });

  it("normalizes malformed live report error codes", () => {
    expect(
      summarizeCommandError(
        {
          code: "Order ZEP1234 failed near C:\\Users\\parth\\.zepo-live",
          message: "Bad code should not leak.",
          hint: "Retry after OTP 123456."
        },
        "",
        []
      )
    ).toEqual({
      code: "command_failed",
      message: "Bad code should not leak.",
      hint: "Retry after OTP <redacted-verification-code>."
    });

    expect(
      summarizeCommandError(
        {
          code: "order_zep1234",
          message: "Lowercase malformed code should not be preserved."
        },
        "",
        []
      )
    ).toEqual({
      code: "command_failed",
      message: "Lowercase malformed code should not be preserved."
    });
  });

  it("fails live report steps that exit successfully without JSON evidence", () => {
    const { step, payload } = buildLiveReportStep({
      name: "cart",
      args: ["--data-dir", ".zepo-live", "--visible", "cart", "--json"],
      status: 0,
      stdout: "Cart loaded.",
      stderr: "",
      summarizePayload: () => ({ observed: true })
    });

    expect(payload).toBeUndefined();
    expect(step).toEqual({
      name: "cart",
      command: "zepo --data-dir <redacted-data-dir> --visible cart --json",
      exitCode: 1,
      ok: false,
      error: {
        code: "live_json_unreadable",
        message: "Command exited successfully but did not emit readable JSON."
      }
    });
  });

  it("fails live report steps that emit primitive JSON evidence", () => {
    for (const stdout of ['"ok"', "123", "true", "null"]) {
      const { step, payload } = buildLiveReportStep({
        name: "cart",
        args: ["--data-dir", ".zepo-live", "--visible", "cart", "--json"],
        status: 0,
        stdout,
        stderr: "",
        summarizePayload: () => ({ observed: true })
      });

      expect(payload).toBe(JSON.parse(stdout));
      expect(step).toEqual({
        name: "cart",
        command: "zepo --data-dir <redacted-data-dir> --visible cart --json",
        exitCode: 1,
        ok: false,
        error: {
          code: "live_json_unexpected",
          message: "Command exited successfully but emitted JSON that was not an object or array."
        }
      });
    }
  });

  it("fails setup live report steps without expected session evidence", () => {
    for (const testCase of [
      {
        name: "login",
        args: ["--data-dir", ".zepo-live", "--visible", "login", "--json"],
        stdout: JSON.stringify({ status: "session_saved", sessionSaved: true, confirmedSession: false }),
        error: {
          code: "live_login_contract_mismatch",
          message: "Login JSON did not confirm a saved Zepto session."
        }
      },
      {
        name: "doctor",
        args: ["--data-dir", ".zepo-live", "doctor", "--skip-browser", "--json"],
        stdout: JSON.stringify({ ok: false, checks: [] }),
        error: {
          code: "live_doctor_contract_mismatch",
          message: "Doctor JSON did not report ready browser automation and passing Playwright Chromium checks."
        }
      },
      {
        name: "doctor",
        args: ["--data-dir", ".zepo-live", "doctor", "--skip-browser", "--json"],
        stdout: JSON.stringify({ ok: true, checks: [], ...automationDiagnosticsPayload() }),
        error: {
          code: "live_doctor_contract_mismatch",
          message: "Doctor JSON did not report ready browser automation and passing Playwright Chromium checks."
        }
      },
      {
        name: "doctor",
        args: ["--data-dir", ".zepo-live", "doctor", "--json"],
        stdout: JSON.stringify({
          ok: true,
          checks: [{ name: "Playwright Chromium", status: "pass" }],
          ...automationDiagnosticsPayloadWithoutMode()
        }),
        error: {
          code: "live_doctor_contract_mismatch",
          message: "Doctor JSON did not report ready browser automation and passing Playwright Chromium checks."
        }
      },
      {
        name: "doctor",
        args: ["--data-dir", ".zepo-live", "doctor", "--json"],
        stdout: JSON.stringify({
          ok: true,
          checks: [{ name: "Playwright Chromium", status: "pass" }],
          ...automationDiagnosticsPayload(),
          browserAutomation: {
            ready: false,
            reasons: ["browser_lock_active"],
            retryAfterMs: 0
          }
        }),
        error: {
          code: "live_doctor_contract_mismatch",
          message: "Doctor JSON did not report ready browser automation and passing Playwright Chromium checks."
        }
      },
      {
        name: "status",
        args: ["--data-dir", ".zepo-live", "status", "--json"],
        stdout: JSON.stringify({ confirmedSession: true }),
        error: {
          code: "live_status_contract_mismatch",
          message: "Status JSON did not report ready browser automation."
        }
      },
      {
        name: "status",
        args: ["--data-dir", ".zepo-live", "status", "--json"],
        stdout: JSON.stringify({ confirmedSession: true, ...statusDiagnosticsPayloadWithoutMode() }),
        error: {
          code: "live_status_contract_mismatch",
          message: "Status JSON did not report ready browser automation."
        }
      },
      {
        name: "status",
        args: ["--data-dir", ".zepo-live", "status", "--json"],
        stdout: JSON.stringify({
          confirmedSession: true,
          ...statusDiagnosticsPayload(),
          browserAutomation: {
            ready: false,
            reasons: ["zepto_access_cooldown"],
            retryAfterMs: 900_000
          },
          accessChallenge: { detected: true, cooldownActive: true, retryAfterMs: 900_000 }
        }),
        error: {
          code: "live_status_contract_mismatch",
          message: "Status JSON did not report ready browser automation."
        }
      },
      {
        name: "status live",
        args: ["--data-dir", ".zepo-live", "--visible", "status", "--live", "--json"],
        stdout: JSON.stringify({
          confirmedSession: true,
          liveSession: { checked: true, state: "login-required" }
        }),
        error: {
          code: "live_status_contract_mismatch",
          message: "Live status JSON did not verify a logged-in Zepto session."
        }
      },
      {
        name: "status live",
        args: ["--data-dir", ".zepo-live", "--visible", "status", "--live", "--json"],
        stdout: JSON.stringify({
          confirmedSession: true,
          ...statusDiagnosticsPayload(),
          browserAutomation: {
            ready: false,
            reasons: ["browser_lock_active"],
            retryAfterMs: 0
          },
          liveSession: { checked: true, state: "logged-in" }
        }),
        error: {
          code: "live_status_contract_mismatch",
          message: "Live status JSON did not verify a logged-in Zepto session."
        }
      },
      {
        name: "history",
        args: ["--data-dir", ".zepo-live", "--visible", "history", "--json"],
        stdout: "{}",
        error: {
          code: "live_history_contract_mismatch",
          message: "History JSON did not include a readable order-history array."
        }
      }
    ]) {
      const { step } = buildLiveReportStep({
        ...testCase,
        status: 0,
        stderr: "",
        summarizePayload: () => {
          throw new Error(`${testCase.name} payload should not be summarized`);
        }
      });

      expect(step.exitCode).toBe(1);
      expect(step.ok).toBe(false);
      expect(step.error).toEqual(testCase.error);
    }
  });

  it("accepts setup live report steps with expected session evidence", () => {
    for (const testCase of [
      {
        name: "login",
        args: ["--data-dir", ".zepo-live", "--visible", "login", "--json"],
        stdout: JSON.stringify({ status: "session_saved", sessionSaved: true, confirmedSession: true })
      },
      {
        name: "doctor",
        args: ["--data-dir", ".zepo-live", "doctor", "--skip-browser", "--json"],
        stdout: JSON.stringify({
          ok: true,
          checks: [{ name: "Playwright Chromium", status: "pass" }],
          ...automationDiagnosticsPayload()
        })
      },
      {
        name: "status",
        args: ["--data-dir", ".zepo-live", "status", "--json"],
        stdout: JSON.stringify({
          confirmedSession: false,
          ...statusDiagnosticsPayload()
        })
      },
      {
        name: "status live",
        args: ["--data-dir", ".zepo-live", "--visible", "status", "--live", "--json"],
        stdout: JSON.stringify({
          confirmedSession: true,
          ...statusDiagnosticsPayload(),
          liveSession: { checked: true, state: "logged-in" }
        })
      },
      {
        name: "history",
        args: ["--data-dir", ".zepo-live", "--visible", "history", "--json"],
        stdout: "[]"
      }
    ]) {
      const { step } = buildLiveReportStep({
        ...testCase,
        status: 0,
        stderr: "",
        summarizePayload: () => ({ observed: true })
      });

      expect(step).toMatchObject({
        exitCode: 0,
        ok: true,
        summary: {
          observed: true
        }
      });
    }
  });

  it("fails checkout live report steps that violate the payment handoff contract", () => {
    const { step, payload } = buildLiveReportStep({
      name: "checkout",
      args: ["--data-dir", ".zepo-live", "--visible", "checkout", "--json"],
      status: 0,
      stdout: JSON.stringify({
        status: "checkout_handoff_returned",
        payment: "handled_by_zepto",
        cartPrecondition: "non_empty_cart_verified",
        paymentStatus: "paid",
        orderPlacement: "not_confirmed_by_zepocli",
        orderStatusCommand: "zepo track"
      }),
      stderr: "",
      summarizePayload: () => {
        throw new Error("unsafe checkout payload should not be summarized");
      }
    });

    expect(payload).toMatchObject({
      status: "checkout_handoff_returned",
      cartPrecondition: "non_empty_cart_verified",
      paymentStatus: "paid"
    });
    expect(step).toEqual({
      name: "checkout",
      command: "zepo --data-dir <redacted-data-dir> --visible checkout --json",
      exitCode: 1,
      ok: false,
      error: {
        code: "live_checkout_contract_mismatch",
        message: "Checkout JSON did not preserve the Zepto cart, payment, and order-placement handoff contract."
      }
    });
  });

  it("fails checkout live report steps without cart precondition evidence", () => {
    const { step } = buildLiveReportStep({
      name: "checkout",
      args: ["--data-dir", ".zepo-live", "--visible", "checkout", "--json"],
      status: 0,
      stdout: JSON.stringify({
        status: "checkout_handoff_returned",
        payment: "handled_by_zepto",
        paymentStatus: "not_observed_by_zepocli",
        orderPlacement: "not_confirmed_by_zepocli",
        orderStatusCommand: "zepo track"
      }),
      stderr: "",
      summarizePayload: () => {
        throw new Error("checkout payload without cart proof should not be summarized");
      }
    });

    expect(step).toEqual({
      name: "checkout",
      command: "zepo --data-dir <redacted-data-dir> --visible checkout --json",
      exitCode: 1,
      ok: false,
      error: {
        code: "live_checkout_contract_mismatch",
        message: "Checkout JSON did not preserve the Zepto cart, payment, and order-placement handoff contract."
      }
    });
  });

  it("does not count manual checkout action as live checkout handoff coverage", () => {
    const { step } = buildLiveReportStep({
      name: "checkout",
      args: ["--data-dir", ".zepo-live", "--visible", "checkout", "--wait", "--json"],
      status: 0,
      stdout: JSON.stringify({
        status: "checkout_manual_action_required",
        payment: "handled_by_zepto",
        cartPrecondition: "non_empty_cart_verified",
        paymentStatus: "not_observed_by_zepocli",
        orderPlacement: "not_confirmed_by_zepocli",
        orderStatusCommand: "zepo track"
      }),
      stderr: "",
      summarizePayload: () => {
        throw new Error("manual checkout payload should not be summarized as handoff coverage");
      }
    });

    expect(step).toEqual({
      name: "checkout",
      command: "zepo --data-dir <redacted-data-dir> --visible checkout --wait --json",
      exitCode: 1,
      ok: false,
      manualEvidence: {
        status: "checkout_manual_action_required",
        cartPrecondition: "non_empty_cart_verified",
        paymentStatus: "not_observed_by_zepocli",
        orderPlacement: "not_confirmed_by_zepocli",
        orderStatusCommand: "zepo track"
      },
      error: {
        code: "live_verification_incomplete",
        message: "Checkout requires manual Zepto payment-control action and is not checkout handoff coverage."
      }
    });

    const report = acceptedLiveReport({
      ok: false,
      requested: summarizeLiveReportRequests({
        search: "milk",
        checkout: true
      }),
      steps: acceptedLiveReport().steps.map((candidate) => (candidate.name === "checkout" ? step : candidate))
    });
    report.attempted = summarizeLiveReportAttempts(report.steps);
    report.coverage = summarizeLiveReportCoverage(report.steps);
    report.missingCoverage = summarizeLiveReportMissingCoverage(report.requested, report.coverage);

    const result = validateLiveReportAcceptance(report, { expectedVersion: packageJson.version });
    expect(result.accepted).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("live_report_not_ok");
    expect(result.issues.map((issue) => issue.code)).toContain("live_report_requested_coverage_missing");
    expect(result.issues.map((issue) => issue.code)).not.toContain("live_report_unexpected_field");
    expect(result.issues.map((issue) => issue.code)).not.toContain("live_report_step_result_mismatch");
    expect(result.issues.map((issue) => issue.code)).not.toContain("live_report_step_contract_mismatch");
  });

  it("rejects production-scope reports that track after manual checkout without handoff coverage", () => {
    const manualCheckoutStep = {
      name: "checkout",
      command: "zepo --data-dir <redacted-data-dir> --visible checkout --wait --json",
      exitCode: 1,
      ok: false,
      manualEvidence: {
        status: "checkout_manual_action_required",
        cartPrecondition: "non_empty_cart_verified",
        paymentStatus: "not_observed_by_zepocli",
        orderPlacement: "not_confirmed_by_zepocli",
        orderStatusCommand: "zepo track"
      },
      error: {
        code: "live_verification_incomplete",
        message: "Checkout requires manual Zepto payment-control action and is not checkout handoff coverage."
      }
    };
    const report = productionScopeLiveReport({
      ok: false,
      generatedAt: new Date().toISOString(),
      steps: productionScopeLiveReport().steps.map((step) =>
        step.name === "checkout" ? manualCheckoutStep : step
      )
    });
    report.attempted = summarizeLiveReportAttempts(report.steps);
    report.coverage = summarizeLiveReportCoverage(report.steps);
    report.missingCoverage = summarizeLiveReportMissingCoverage(report.requested, report.coverage);

    expect(report.coverage.track).toBe(true);
    expect(report.coverage.checkoutHandoff).toBe(false);
    expect(report.missingCoverage.checkoutHandoff).toBe(true);

    const result = validateLiveReportAcceptance(report, {
      expectedVersion: packageJson.version,
      requireProductionScope: true,
      maxAgeMs: 60_000
    });

    expect(result.accepted).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("live_report_not_ok");
    expect(result.issues.map((issue) => issue.code)).toContain("live_report_requested_coverage_missing");
    expect(result.issues.map((issue) => issue.code)).toContain("live_report_production_scope_missing");
    expect(JSON.stringify(result.issues)).not.toContain("checkout_manual_action_required");
  });

  it("rejects malformed manual checkout evidence in live reports", () => {
    const report = acceptedLiveReport({
      ok: false,
      steps: acceptedLiveReport().steps.map((step) =>
        step.name === "checkout"
          ? {
              name: "checkout",
              command: "zepo --data-dir <redacted-data-dir> --visible checkout --wait --json",
              exitCode: 1,
              ok: false,
              manualEvidence: {
                status: "checkout_handoff_returned",
                cartPrecondition: "non_empty_cart_verified",
                paymentStatus: "not_observed_by_zepocli",
                orderPlacement: "not_confirmed_by_zepocli",
                orderStatusCommand: "zepo track",
                rawPageText: "Amul Milk 500ml"
              },
              error: {
                code: "live_verification_incomplete",
                message: "Checkout requires manual Zepto payment-control action and is not checkout handoff coverage."
              }
            }
          : step
      )
    });
    report.attempted = summarizeLiveReportAttempts(report.steps);
    report.coverage = summarizeLiveReportCoverage(report.steps);
    report.missingCoverage = summarizeLiveReportMissingCoverage(report.requested, report.coverage);

    const result = validateLiveReportAcceptance(report, { expectedVersion: packageJson.version });
    expect(result.accepted).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("live_report_unexpected_field");
    expect(result.issues.map((issue) => issue.code)).toContain("live_report_step_contract_mismatch");
    expect(JSON.stringify(result.issues)).not.toContain("Amul Milk");
  });

  it("accepts sanitized checkout wait command strings in live reports", () => {
    for (const command of [
      "zepo --data-dir <redacted-data-dir> --visible checkout --wait --json",
      "zepo --data-dir <redacted-data-dir> --visible checkout --remove-limit-items --wait --json"
    ]) {
      const report = acceptedLiveReport({
        steps: acceptedLiveReport().steps.map((step) =>
          step.name === "checkout"
            ? {
                ...step,
                command
              }
            : step
        )
      });
      report.attempted = summarizeLiveReportAttempts(report.steps);
      report.coverage = summarizeLiveReportCoverage(report.steps);
      report.missingCoverage = summarizeLiveReportMissingCoverage(report.requested, report.coverage);

      expect(validateLiveReportAcceptance(report, { expectedVersion: packageJson.version }).accepted).toBe(true);
    }
  });

  it("accepts checkout live report steps that preserve the payment handoff contract", () => {
    const { step } = buildLiveReportStep({
      name: "checkout",
      args: ["--data-dir", ".zepo-live", "--visible", "checkout", "--json"],
      status: 0,
      stdout: JSON.stringify({
        status: "checkout_handoff_returned",
        payment: "handled_by_zepto",
        cartPrecondition: "non_empty_cart_verified",
        paymentStatus: "not_observed_by_zepocli",
        orderPlacement: "not_confirmed_by_zepocli",
        orderStatusCommand: "zepo track"
      }),
      stderr: "",
      summarizePayload: (_name: string, value: { cartPrecondition?: string; orderStatusCommand?: string }) => ({
        cartPrecondition: value.cartPrecondition,
        orderStatusCommand: value.orderStatusCommand
      })
    });

    expect(step).toEqual({
      name: "checkout",
      command: "zepo --data-dir <redacted-data-dir> --visible checkout --json",
      exitCode: 0,
      ok: true,
      summary: {
        cartPrecondition: "non_empty_cart_verified",
        orderStatusCommand: "zepo track"
      }
    });
  });

  it("fails track live report steps without readable tracking evidence", () => {
    for (const stdout of ["[]", JSON.stringify([{ id: "ZEP1234" }])]) {
      const { step, payload } = buildLiveReportStep({
        name: "track",
        args: ["--data-dir", ".zepo-live", "--visible", "track", "--json"],
        status: 0,
        stdout,
        stderr: "",
        summarizePayload: () => {
          throw new Error("unreadable tracking payload should not be summarized");
        }
      });

      expect(payload).toEqual(JSON.parse(stdout));
      expect(step).toEqual({
        name: "track",
        command: "zepo --data-dir <redacted-data-dir> --visible track --json",
        exitCode: 1,
        ok: false,
        error: {
          code: "live_track_contract_mismatch",
          message: "Track JSON did not include a latest order with readable status or ETA."
        }
      });
    }
  });

  it("accepts track live report steps with readable status or ETA", () => {
    for (const stdout of [JSON.stringify([{ status: "Out for delivery" }]), JSON.stringify([{ eta: "8 mins" }])]) {
      const { step } = buildLiveReportStep({
        name: "track",
        args: ["--data-dir", ".zepo-live", "--visible", "track", "--json"],
        status: 0,
        stdout,
        stderr: "",
        summarizePayload: (_name: string, value: Array<{ status?: string; eta?: string }>) => ({
          latestHasStatus: typeof value[0]?.status === "string",
          latestHasEta: typeof value[0]?.eta === "string"
        })
      });

      expect(step.ok).toBe(true);
      expect(step.exitCode).toBe(0);
      expect(step.summary).toBeDefined();
    }
  });

  it("fails history live report steps with unreadable order entries", () => {
    for (const stdout of [
      JSON.stringify([{}]),
      JSON.stringify([{ id: "ZEP1234" }]),
      JSON.stringify([{ total: "₹249" }]),
      JSON.stringify([{ placedAt: "Yesterday" }])
    ]) {
      const { step } = buildLiveReportStep({
        name: "history",
        args: ["--data-dir", ".zepo-live", "--visible", "history", "--json"],
        status: 0,
        stdout,
        stderr: "",
        summarizePayload: () => {
          throw new Error("unreadable history payload should not be summarized");
        }
      });

      expect(step).toEqual({
        name: "history",
        command: "zepo --data-dir <redacted-data-dir> --visible history --json",
        exitCode: 1,
        ok: false,
        error: {
          code: "live_history_contract_mismatch",
          message: "History JSON did not include a readable order-history array."
        }
      });
    }
  });

  it("accepts history live report steps with empty or readable order history", () => {
    for (const stdout of [
      "[]",
      JSON.stringify([{ status: "Delivered", total: "₹249" }]),
      JSON.stringify([{ eta: "8 mins" }])
    ]) {
      const { step } = buildLiveReportStep({
        name: "history",
        args: ["--data-dir", ".zepo-live", "--visible", "history", "--json"],
        status: 0,
        stdout,
        stderr: "",
        summarizePayload: (_name: string, value: Array<{ eta?: string; status?: string }>) => ({
          orderCount: value.filter((order) => typeof order.status === "string" || typeof order.eta === "string").length
        })
      });

      expect(step.ok).toBe(true);
      expect(step.exitCode).toBe(0);
      expect(step.summary).toBeDefined();
    }
  });

  it("fails search live report steps without readable product results", () => {
    for (const stdout of ["[]", JSON.stringify([{}]), JSON.stringify([{ name: "Milk" }])]) {
      const { step } = buildLiveReportStep({
        name: "search",
        args: ["--data-dir", ".zepo-live", "--visible", "search", "milk", "--json"],
        status: 0,
        stdout,
        stderr: "",
        summarizePayload: () => {
          throw new Error("unreadable search payload should not be summarized");
        }
      });

      expect(step).toEqual({
        name: "search",
        command: "zepo --data-dir <redacted-data-dir> --visible search <redacted-query> --json",
        exitCode: 1,
        ok: false,
        error: {
          code: "live_search_contract_mismatch",
          message: "Search JSON did not include readable product results with price or unit detail."
        }
      });
    }
  });

  it("accepts search live report steps with product results", () => {
    const { step } = buildLiveReportStep({
      name: "search",
      args: ["--data-dir", ".zepo-live", "--visible", "search", "milk", "--json"],
      status: 0,
      stdout: JSON.stringify([{ index: 0, name: "Milk", unit: "500 ml" }]),
      stderr: "",
      summarizePayload: (_name: string, value: unknown[]) => ({
        productCount: value.length,
        productDetailCount: value.filter((product) => typeof (product as { unit?: unknown }).unit === "string").length
      })
    });

    expect(step).toMatchObject({
      exitCode: 0,
      ok: true,
      summary: {
        productCount: 1,
        productDetailCount: 1
      }
    });
  });

  it("fails add live report steps without readable product and cart evidence", () => {
    for (const stdout of [
      JSON.stringify({ product: { name: "Milk" }, cart: { items: [] } }),
      JSON.stringify({ product: {}, cart: { items: [{ name: "Milk" }] } }),
      JSON.stringify({ product: { name: "Milk" }, cart: { items: [{}] } }),
      JSON.stringify({ product: { name: "Milk" }, cart: { items: [{ name: "Milk" }] } }),
      JSON.stringify({ product: { name: "Milk", unit: "500 ml" }, cart: { items: [{}] } })
    ]) {
      const { step } = buildLiveReportStep({
        name: "add",
        args: ["--data-dir", ".zepo-live", "--visible", "add", "milk", "--json"],
        status: 0,
        stdout,
        stderr: "",
        summarizePayload: () => {
          throw new Error("incomplete add payload should not be summarized");
        }
      });

      expect(step).toEqual({
        name: "add",
        command: "zepo --data-dir <redacted-data-dir> --visible add <redacted-query> --json",
        exitCode: 1,
        ok: false,
        error: {
          code: "live_add_contract_mismatch",
          message: "Add JSON did not include an added product with price or unit detail and readable cart items."
        }
      });
    }
  });

  it("accepts add live report steps with product and cart evidence", () => {
    const { step } = buildLiveReportStep({
      name: "add",
      args: ["--data-dir", ".zepo-live", "--visible", "add", "milk", "--json"],
      status: 0,
      stdout: JSON.stringify({
        product: { index: 0, name: "Milk", unit: "500 ml" },
        cart: { items: [{ name: "Milk" }] }
      }),
      stderr: "",
      summarizePayload: () => ({ productAdded: true, productHasDetail: true, cartItemCount: 1 })
    });

    expect(step).toMatchObject({
      exitCode: 0,
      ok: true,
      summary: {
        productAdded: true,
        productHasDetail: true,
        cartItemCount: 1
      }
    });
  });

  it("fails address list live report steps without structural address detail", () => {
    for (const name of ["address add", "address list"]) {
      for (const stdout of [
        "[]",
        JSON.stringify([{}]),
        JSON.stringify([{ text: "Home" }]),
        JSON.stringify([{ text: "Amul Milk 500ml" }]),
        JSON.stringify([{ text: "Checkout Pay ₹249" }]),
        JSON.stringify([{ text: "Saved addresses" }]),
        JSON.stringify([{ text: "Home" }, { text: "Flat 12 Tower 7 MG Road" }])
      ]) {
        const { step } = buildLiveReportStep({
          name,
          args: ["--data-dir", ".zepo-live", "--visible", "address", name.endsWith("add") ? "add" : "list", "--json"],
          status: 0,
          stdout,
          stderr: "",
          summarizePayload: () => {
            throw new Error("unreadable address payload should not be summarized");
          }
        });

        expect(step.exitCode).toBe(1);
        expect(step.ok).toBe(false);
        expect(step.error).toEqual({
          code: "live_address_contract_mismatch",
          message: "Address JSON did not include address records with readable address detail."
        });
      }
    }
  });

  it("accepts address list live report steps with structural address detail", () => {
    for (const name of ["address add", "address list"]) {
      const { step } = buildLiveReportStep({
        name,
        args: ["--data-dir", ".zepo-live", "--visible", "address", name.endsWith("add") ? "add" : "list", "--json"],
        status: 0,
        stdout: JSON.stringify([{ text: "Flat 12 Tower 7 MG Road", selected: true }]),
        stderr: "",
        summarizePayload: () => ({ addressCount: 1, hasAddressDetail: true })
      });

      expect(step).toMatchObject({
        exitCode: 0,
        ok: true,
        summary: {
          addressCount: 1,
          hasAddressDetail: true
        }
      });
    }
  });

  it("fails address use live report steps without a selected address with detail", () => {
    for (const stdout of [
      JSON.stringify({ text: "Flat 12 Tower 7 MG Road", selected: false }),
      JSON.stringify({ text: "Home", selected: true }),
      JSON.stringify({ text: "Amul Milk 500ml", selected: true }),
      JSON.stringify({ text: "Checkout Pay ₹249", selected: true })
    ]) {
      const { step } = buildLiveReportStep({
        name: "address use",
        args: ["--data-dir", ".zepo-live", "--visible", "address", "use", "home", "--json"],
        status: 0,
        stdout,
        stderr: "",
        summarizePayload: () => {
          throw new Error("unusable address payload should not be summarized");
        }
      });

      expect(step).toEqual({
        name: "address use",
        command: "zepo --data-dir <redacted-data-dir> --visible address use <redacted-address-query> --json",
        exitCode: 1,
        ok: false,
        error: {
          code: "live_address_contract_mismatch",
          message: "Address selection JSON did not include a selected address with readable address detail."
        }
      });
    }
  });

  it("accepts address use live report steps with a selected address with detail", () => {
    const { step } = buildLiveReportStep({
      name: "address use",
      args: ["--data-dir", ".zepo-live", "--visible", "address", "use", "home", "--json"],
      status: 0,
      stdout: JSON.stringify({ text: "Flat 12 Tower 7 MG Road", selected: true }),
      stderr: "",
      summarizePayload: () => ({ selected: true, hasAddressText: true, hasAddressDetail: true })
    });

    expect(step).toMatchObject({
      exitCode: 0,
      ok: true,
      summary: {
        selected: true,
        hasAddressText: true,
        hasAddressDetail: true
      }
    });
  });

  it("fails reorder live report steps without readable cart items", () => {
    for (const stdout of [JSON.stringify({ items: [] }), JSON.stringify({ items: [{}] })]) {
      const { step } = buildLiveReportStep({
        name: "reorder",
        args: ["--data-dir", ".zepo-live", "--visible", "reorder", "last", "--json"],
        status: 0,
        stdout,
        stderr: "",
        summarizePayload: () => {
          throw new Error("empty reorder payload should not be summarized");
        }
      });

      expect(step).toEqual({
        name: "reorder",
        command: "zepo --data-dir <redacted-data-dir> --visible reorder last --json",
        exitCode: 1,
        ok: false,
        error: {
          code: "live_reorder_contract_mismatch",
          message: "Reorder JSON did not include readable cart items."
        }
      });
    }
  });

  it("accepts reorder live report steps with readable cart items", () => {
    const { step } = buildLiveReportStep({
      name: "reorder",
      args: ["--data-dir", ".zepo-live", "--visible", "reorder", "last", "--json"],
      status: 0,
      stdout: JSON.stringify({ items: [{ name: "Milk" }] }),
      stderr: "",
      summarizePayload: () => ({ cartItemCount: 1 })
    });

    expect(step).toMatchObject({
      exitCode: 0,
      ok: true,
      summary: {
        cartItemCount: 1
      }
    });
  });

  it("fails cart and remove live report steps without readable cart-shaped JSON", () => {
    for (const name of ["cart", "remove"]) {
      for (const stdout of ["{}", JSON.stringify({ items: [{}] })]) {
        const { step } = buildLiveReportStep({
          name,
          args:
            name === "cart"
              ? ["--data-dir", ".zepo-live", "--visible", "cart", "--json"]
              : ["--data-dir", ".zepo-live", "--visible", "remove", "milk", "--json"],
          status: 0,
          stdout,
          stderr: "",
          summarizePayload: () => {
            throw new Error("non-cart payload should not be summarized");
          }
        });

        expect(step.exitCode).toBe(1);
        expect(step.ok).toBe(false);
        expect(step.error).toEqual({
          code: "live_cart_contract_mismatch",
          message:
            name === "cart"
              ? "Cart JSON did not include readable non-empty cart items."
              : "Cart JSON did not include a readable cart item array."
        });
      }
    }
  });

  it("requires non-empty cart live report steps but allows remove to empty the cart", () => {
    const emptyCartStep = buildLiveReportStep({
      name: "cart",
      args: ["--data-dir", ".zepo-live", "--visible", "cart", "--json"],
      status: 0,
      stdout: JSON.stringify({ items: [] }),
      stderr: "",
      summarizePayload: () => ({ cartItemCount: 0 })
    }).step;

    expect(emptyCartStep).toEqual({
      name: "cart",
      command: "zepo --data-dir <redacted-data-dir> --visible cart --json",
      exitCode: 1,
      ok: false,
      error: {
        code: "live_cart_contract_mismatch",
        message: "Cart JSON did not include readable non-empty cart items."
      }
    });

    for (const name of ["cart", "remove"]) {
      const { step } = buildLiveReportStep({
        name,
        args:
          name === "cart"
            ? ["--data-dir", ".zepo-live", "--visible", "cart", "--json"]
            : ["--data-dir", ".zepo-live", "--visible", "remove", "milk", "--json"],
        status: 0,
        stdout: JSON.stringify(name === "cart" ? { items: [{ name: "Milk" }] } : { items: [] }),
        stderr: "",
        summarizePayload: () => ({ cartItemCount: name === "cart" ? 1 : 0 })
      });

      expect(step).toMatchObject({
        exitCode: 0,
        ok: true,
        summary: {
          cartItemCount: name === "cart" ? 1 : 0
        }
      });
    }
  });

  it("fails clear live report steps that do not show an empty cart", () => {
    for (const stdout of [JSON.stringify({ items: [{ name: "Milk" }] }), "{}"]) {
      const { step } = buildLiveReportStep({
        name: "clear",
        args: ["--data-dir", ".zepo-live", "--visible", "clear", "--json"],
        status: 0,
        stdout,
        stderr: "",
        summarizePayload: () => {
          throw new Error("uncleared cart payload should not be summarized");
        }
      });

      expect(step).toEqual({
        name: "clear",
        command: "zepo --data-dir <redacted-data-dir> --visible clear --json",
        exitCode: 1,
        ok: false,
        error: {
          code: "live_clear_contract_mismatch",
          message: "Clear JSON did not show an empty cart."
        }
      });
    }
  });

  it("accepts clear live report steps that show an empty cart", () => {
    const { step } = buildLiveReportStep({
      name: "clear",
      args: ["--data-dir", ".zepo-live", "--visible", "clear", "--json"],
      status: 0,
      stdout: JSON.stringify({ items: [] }),
      stderr: "",
      summarizePayload: () => ({ cartItemCount: 0 })
    });

    expect(step).toEqual({
      name: "clear",
      command: "zepo --data-dir <redacted-data-dir> --visible clear --json",
      exitCode: 0,
      ok: true,
      summary: {
        cartItemCount: 0
      }
    });
  });

  it("summarizes successful live report steps only when JSON is readable", () => {
    const { step, payload } = buildLiveReportStep({
      name: "cart",
      args: ["--data-dir", ".zepo-live", "--visible", "cart", "--json"],
      status: 0,
      stdout: "{\"items\":[{\"name\":\"Milk\"}]}",
      stderr: "",
      summarizePayload: (name: string, value: { items?: unknown[] }) => ({
        name,
        cartItemCount: Array.isArray(value.items) ? value.items.length : -1
      })
    });

    expect(payload).toEqual({ items: [{ name: "Milk" }] });
    expect(step).toEqual({
      name: "cart",
      command: "zepo --data-dir <redacted-data-dir> --visible cart --json",
      exitCode: 0,
      ok: true,
      summary: {
        name: "cart",
        cartItemCount: 1
      }
    });
  });

  it("fails live report steps when summary generation fails and redacts sensitive text", () => {
    const { step } = buildLiveReportStep({
      name: "cart",
      args: ["--data-dir", "C:\\Users\\parth\\.zepo-live", "--visible", "cart", "--json"],
      status: 0,
      stdout: "{\"items\":[{\"name\":\"Milk\"}]}",
      stderr: "",
      summarizePayload: () => {
        throw new Error(
          "Could not summarize C:\\Users\\parth\\.zepo-live\\trace.txt after OTP 123456 and UPI PIN 1234."
        );
      }
    });

    expect(step).toEqual({
      name: "cart",
      command: "zepo --data-dir <redacted-data-dir> --visible cart --json",
      exitCode: 1,
      ok: false,
      error: {
        code: "live_summary_failed",
        message:
          "Could not summarize <redacted-data-dir> after OTP <redacted-verification-code> and UPI PIN <redacted-verification-code>."
      }
    });
  });

  it("redacts workflow inputs from stored error messages and hints", () => {
    const args = [
      "--data-dir",
      "C:\\Users\\parth\\.zepo-live",
      "--visible",
      "address",
      "use",
      "Home Tower 7",
      "--json"
    ];

    expect(
      summarizeCommandError(
        {
          code: "address_selection_unverified",
          message: 'Zepto did not show a selected address matching "Home Tower 7" after the selection click.',
          hint: "Rerun with C:\\Users\\parth\\.zepo-live and confirm Home Tower 7 is selected."
        },
        "",
        args
      )
    ).toEqual({
      code: "address_selection_unverified",
      message: 'Zepto did not show a selected address matching "<redacted-address-query>" after the selection click.',
      hint: "Rerun with <redacted-data-dir> and confirm <redacted-address-query> is selected."
    });

    expect(
      summarizeCommandError(
        {
          code: "cart_item_not_found",
          message: 'Could not find a removable cart item matching "Amul Milk 500ml".',
          hint: "Run `zepo cart` and remove Amul Milk 500ml manually if needed."
        },
        "",
        ["--data-dir", ".zepo-live", "--visible", "remove", "Amul Milk 500ml", "--json"]
      )
    ).toEqual({
      code: "cart_item_not_found",
      message: 'Could not find a removable cart item matching "<redacted-cart-query>".',
      hint: "Run `zepo cart` and remove <redacted-cart-query> manually if needed."
    });
  });

  it("redacts workflow inputs from fallback stderr summaries", () => {
    expect(
      summarizeCommandError(
        undefined,
        'Could not find a Zepto product matching "Amul Milk 500ml".\nMore details are omitted.',
        ["--data-dir", ".zepo-live", "--visible", "add", "Amul Milk 500ml", "--json"]
      )
    ).toEqual({
      code: "command_failed",
      message: 'Could not find a Zepto product matching "<redacted-query>".'
    });
  });

  it("redacts URL-encoded workflow inputs from live errors and console stderr", () => {
    const args = ["--data-dir", ".zepo-live", "--visible", "add", "Amul Milk 500ml", "--json"];

    expect(
      summarizeCommandError(
        {
          code: "zepto_access_challenge",
          message: "Zepto returned HTTP 429 from https://www.zepto.com/api/search?query=Amul%20Milk%20500ml.",
          hint: "Retry https://www.zepto.com/search?query=Amul+Milk+500ml later."
        },
        "",
        args
      )
    ).toEqual({
      code: "zepto_access_challenge",
      message: "Zepto returned HTTP 429 from https://www.zepto.com/api/search?query=<redacted-query>.",
      hint: "Retry https://www.zepto.com/search?query=<redacted-query> later."
    });

    const redacted = redactLiveConsoleText(
      "Debug URL: https://www.zepto.com/search?query=Amul+Milk+500ml",
      args
    );
    expect(redacted).toContain("query=<redacted-query>");
    expect(redacted).not.toContain("Amul+Milk+500ml");
  });

  it("redacts workflow inputs when global value options appear before the command", () => {
    const args = [
      "--data-dir",
      ".zepo-live",
      "--timeout",
      "45000",
      "--visible",
      "search",
      "Amul Milk 500ml",
      "--json"
    ];

    expect(redactArgsForLiveReport(args)).toEqual([
      "--data-dir",
      "<redacted-data-dir>",
      "--timeout",
      "45000",
      "--visible",
      "search",
      "<redacted-query>",
      "--json"
    ]);
    expect(
      summarizeCommandError(
        undefined,
        "Zepto returned https://www.zepto.com/search?query=Amul%20Milk%20500ml.",
        args
      )
    ).toEqual({
      code: "command_failed",
      message: "Zepto returned https://www.zepto.com/search?query=<redacted-query>."
    });
  });

  it("redacts URL-encoded sensitive values from live report errors and console stderr", () => {
    const encodedUrl =
      "https://example.test/callback?phone=%2B91+98765+43210&otp=%31%32%33%34%35%36&card=4111%201111%201111%201111&upi=abc%40upi&token=raw-token-123&access_token=abc.def.ghi&password=hunter2&secret=client-secret-123&file=C%3A%2FUsers%2Fparth%2F.zepo-live%2Ftrace.txt";
    const encodedBlob =
      "https%3A%2F%2Fexample.test%2Fcallback%3Fphone%3D%2B91%2098765%2043210%26otp%3D123456%26card%3D4111%201111%201111%201111%26upi%3Dabc%40upi%26token%3Draw-token-123%26password%3Dhunter2%26file%3DC%3A%2FUsers%2Fparth%2F.zepo-live%2Freport.json";

    expect(
      summarizeCommandError(
        {
          code: "checkout_handoff_unverified",
          message: `Zepto redirect contained ${encodedUrl} and ${encodedBlob}.`
        },
        "",
        []
      )
    ).toEqual({
      code: "checkout_handoff_unverified",
      message:
        "Zepto redirect contained https://example.test/callback?phone=<redacted-phone>&otp=<redacted-verification-code>&card=<redacted-payment-number>&upi=<redacted-payment-handle>&token=<redacted-auth-token>&access_token=<redacted-auth-token>&password=<redacted-auth-token>&secret=<redacted-auth-token>&file=<redacted-local-path> and https://example.test/callback?phone=<redacted-phone>&otp=<redacted-verification-code>&card=<redacted-payment-number>&upi=<redacted-payment-handle>&token=<redacted-auth-token>&password=<redacted-auth-token>&file=<redacted-local-path>."
    });

    const redacted = redactLiveConsoleText(`Live stderr included ${encodedUrl} and ${encodedBlob}`, []);
    expect(redacted).toContain("phone=<redacted-phone>");
    expect(redacted).toContain("otp=<redacted-verification-code>");
    expect(redacted).toContain("card=<redacted-payment-number>");
    expect(redacted).toContain("upi=<redacted-payment-handle>");
    expect(redacted).toContain("token=<redacted-auth-token>");
    expect(redacted).toContain("access_token=<redacted-auth-token>");
    expect(redacted).toContain("password=<redacted-auth-token>");
    expect(redacted).toContain("secret=<redacted-auth-token>");
    expect(redacted).toContain("file=<redacted-local-path>");
    expect(redacted).not.toContain("%2B91");
    expect(redacted).not.toContain("%31%32%33");
    expect(redacted).not.toContain("4111%201111");
    expect(redacted).not.toContain("abc%40upi");
    expect(redacted).not.toContain("raw-token-123");
    expect(redacted).not.toContain("abc.def.ghi");
    expect(redacted).not.toContain("hunter2");
    expect(redacted).not.toContain("client-secret-123");
    expect(redacted).not.toContain("C%3A%2FUsers");
    expect(redacted).not.toContain("https%3A%2F%2Fexample.test");
    expect(redacted).not.toContain("report.json");
  });

  it("redacts workflow inputs and sensitive values from streamed live console stderr", () => {
    const text =
      'Could not find a Zepto product matching "Amul Milk 500ml" near C:\\Users\\parth\\.zepo-live\\trace.txt and C:/Users/parth/.zepo-live/trace.txt. Order #ZEP1234 failed for +91 98765 43210 and card 4111 1111 1111 1111.';
    const redacted = redactLiveConsoleText(text, [
      "--data-dir",
      ".zepo-live",
      "--visible",
      "add",
      "Amul Milk 500ml",
      "--json"
    ]);

    expect(redacted).toContain('matching "<redacted-query>"');
    expect(redacted).toContain("<redacted-local-path>");
    expect(redacted).toContain("<redacted-order-id>");
    expect(redacted).toContain("<redacted-phone>");
    expect(redacted).toContain("<redacted-payment-number>");
    expect(redacted).not.toContain("Amul Milk 500ml");
    expect(redacted).not.toContain("Users");
    expect(redacted).not.toContain("ZEP1234");
    expect(redacted).not.toContain("98765 43210");
    expect(redacted).not.toContain("4111");
  });

  it("redacts streamed live console stderr across chunk boundaries", () => {
    const chunks: string[] = [];
    const redactor = createLiveConsoleTextRedactor(
      ["--data-dir", ".zepo-live", "--visible", "add", "Amul Milk 500ml", "--json"],
      (chunk: string) => chunks.push(chunk)
    );

    redactor.write('Could not find a Zepto product matching "Amul ');
    redactor.write('Milk 500ml" near C:\\Users\\parth\\.zepo-live\\trace.txt.\n');
    redactor.write("Order #ZEP1234 failed for +91 ");
    redactor.write("98765 43210.");
    redactor.flush();

    const output = chunks.join("");
    expect(output).toContain('matching "<redacted-query>"');
    expect(output).toContain("<redacted-local-path>");
    expect(output).toContain("<redacted-order-id>");
    expect(output).toContain("<redacted-phone>");
    expect(output).not.toContain("Amul Milk 500ml");
    expect(output).not.toContain("Users");
    expect(output).not.toContain("ZEP1234");
    expect(output).not.toContain("98765 43210");
  });

  it("redacts immediate live console streaming across sensitive chunk boundaries", () => {
    const fakeNpmToken = `npm_${"A".repeat(24)}`;
    const chunks: string[] = [];
    const redactor = createLiveConsoleTextRedactor(
      ["--data-dir", ".zepo-live", "--visible", "add", "Amul Milk 500ml", "--json"],
      (chunk: string) => chunks.push(chunk),
      { immediate: true }
    );

    redactor.write("Visible prompt: choose item > ");
    expect(chunks.join("")).toBe("Visible prompt: choose item > ");

    redactor.write("token n");
    expect(chunks.join("")).not.toContain("token n");

    redactor.write("pm");
    expect(chunks.join("")).not.toContain("token npm");

    redactor.write(`${fakeNpmToken.slice(3)} and query "Amul `);
    redactor.write('Milk 500ml" near C:\\Users\\parth\\.');
    redactor.write("zepo-live\\trace.txt for +91 ");
    redactor.write("98765 43210.");
    redactor.flush();

    const output = chunks.join("");
    expect(output.match(/Visible prompt/g)?.length).toBe(1);
    expect(output).toContain("<redacted-npm-token>");
    expect(output).toContain('query "<redacted-query>"');
    expect(output).toContain("<redacted-local-path>");
    expect(output).toContain("<redacted-phone>");
    expect(output).not.toContain(fakeNpmToken);
    expect(output).not.toContain("token npm");
    expect(output).not.toContain("+91");
    expect(output).not.toContain("Amul Milk 500ml");
    expect(output).not.toContain("Users");
    expect(output).not.toContain(".zepo-live");
    expect(output).not.toContain("98765 43210");
  });

  it("redacts generic sensitive values from stored error summaries", () => {
    const fakeNpmToken = `npm_${"A".repeat(24)}`;

    expect(
      summarizeCommandError(
        {
          code: "orders_unreadable",
          message: `Order ID: ZEP1234 failed for phone 98765 43210, token ${fakeNpmToken}, and card 4111 1111 1111 1111.`,
          hint: "Inspect order ZEP9999 in the visible browser; do not store 09876543210."
        },
        "",
        []
      )
    ).toEqual({
      code: "orders_unreadable",
      message:
        "Order <redacted-order-id> failed for phone <redacted-phone>, token <redacted-npm-token>, and card <redacted-payment-number>.",
      hint: "Inspect order <redacted-order-id> in the visible browser; do not store <redacted-phone>."
    });

    expect(
      summarizeCommandError(
        undefined,
        `Order #ZEP7777 failed with payment number 5555 5555 5555 4444 and ${fakeNpmToken}.\nMore details are omitted.`,
        []
      )
    ).toEqual({
      code: "command_failed",
      message: "Order <redacted-order-id> failed with payment number <redacted-payment-number> and <redacted-npm-token>."
    });

    expect(
      summarizeCommandError(
        {
          code: "checkout_handoff_unverified",
          message:
            "Payment handle user.name@okaxis was visible near C:\\Users\\parth\\.zepo-live\\trace.txt, C:/Users/parth/.zepo-live/trace.txt, and .\\.zepo-live\\debug.html.",
          hint:
            "Retry after inspecting /home/parth/.zepo-live/report.json, file:///C:/Users/parth/.zepo-live/report.json, or .zepo-live/live-verification-report.json."
        },
        "",
        []
      )
    ).toEqual({
      code: "checkout_handoff_unverified",
      message:
        "Payment handle <redacted-payment-handle> was visible near <redacted-local-path>, <redacted-local-path>, and <redacted-local-path>.",
      hint: "Retry after inspecting <redacted-local-path>, <redacted-local-path>, or <redacted-local-path>."
    });
  });

  it("redacts bare relative Zepo data directories from live report text", () => {
    const redacted = redactLiveConsoleText(
      "Report paths: .zepo-live, .zepto-live, .zepo-agent/report.json, .zepto-current-smoke\\trace.txt, and --bad=%2Ezepto-live%2Freport.json.",
      []
    );

    expect(redacted).toContain("<redacted-local-path>");
    expect(redacted).not.toContain(".zepo-live");
    expect(redacted).not.toContain(".zepto-live");
    expect(redacted).not.toContain(".zepo-agent");
    expect(redacted).not.toContain(".zepto-current-smoke");
    expect(redacted).not.toContain("%2Ezepto-live");
  });

  it("redacts Linux root and opt local paths from live report text", () => {
    const redacted = redactLiveConsoleText(
      "Live verifier paths: /root/.zepo-live/report.json, /opt/zepocli/.zepto-smoke/trace.txt, and file=/root/.zepto-live/log.txt.",
      []
    );

    expect(redacted).toContain("<redacted-local-path>");
    expect(redacted).toContain("file=<redacted-local-path>");
    expect(redacted).not.toContain("/root");
    expect(redacted).not.toContain("/opt");
    expect(redacted).not.toContain(".zepo-live");
    expect(redacted).not.toContain(".zepto-smoke");
    expect(redacted).not.toContain("trace.txt");
  });

  it("redacts sensitive workflow arguments from stored report commands", () => {
    expect(
      redactArgsForLiveReport([
        "--data-dir",
        "C:\\Users\\parth\\.zepo-live",
        "--browser-locale",
        "hi-IN",
        "--browser-timezone",
        "Asia/Kolkata",
        "--visible",
        "add",
        "Amul Milk 500ml",
        "--quantity",
        "2",
        "--json"
      ])
    ).toEqual([
      "--data-dir",
      "<redacted-data-dir>",
      "--browser-locale",
      "<redacted-browser-locale>",
      "--browser-timezone",
      "<redacted-browser-timezone>",
      "--visible",
      "add",
      "<redacted-query>",
      "--quantity",
      "2",
      "--json"
    ]);

    expect(
      redactArgsForLiveReport([
        "--data-dir",
        "/home/user/.zepo-live",
        "--visible",
        "address",
        "use",
        "Home Tower 7",
        "--json"
      ])
    ).toEqual([
      "--data-dir",
      "<redacted-data-dir>",
      "--visible",
      "address",
      "use",
      "<redacted-address-query>",
      "--json"
    ]);

    expect(
      redactArgsForLiveReport([
        "--data-dir",
        ".zepo-live",
        "--visible",
        "search",
        "protein bars",
        "--report",
        "C:\\Users\\parth\\report.json",
        "--json"
      ])
    ).toEqual([
      "--data-dir",
      "<redacted-data-dir>",
      "--visible",
      "search",
      "<redacted-query>",
      "--report",
      "<redacted-report-path>",
      "--json"
    ]);

    expect(
      redactArgsForLiveReport([
        "--data-dir",
        ".zepo-live",
        "--visible",
        "remove",
        "Amul Milk 500ml",
        "--json"
      ])
    ).toEqual([
      "--data-dir",
      "<redacted-data-dir>",
      "--visible",
      "remove",
      "<redacted-cart-query>",
      "--json"
    ]);

    expect(
      redactArgsForLiveReport([
        "--data-dir",
        ".zepo-live",
        "--visible",
        "login",
        "--phone",
        "9999999999",
        "--json"
      ])
    ).toEqual([
      "--data-dir",
      "<redacted-data-dir>",
      "--visible",
      "login",
      "--phone",
      "<redacted-phone>",
      "--json"
    ]);
  });

  it("keeps console command output useful while redacting local paths, phone input, and workflow queries", () => {
    expect(
      redactArgsForLiveConsole([
        "--data-dir",
        ".zepo-live",
        "--browser-locale",
        "hi-IN",
        "--browser-timezone",
        "Asia/Kolkata",
        "--visible",
        "login",
        "--phone",
        "9999999999",
        "--json"
      ])
    ).toEqual([
      "--data-dir",
      "<redacted-data-dir>",
      "--browser-locale",
      "<redacted-browser-locale>",
      "--browser-timezone",
      "<redacted-browser-timezone>",
      "--visible",
      "login",
      "--phone",
      "<redacted-phone>",
      "--json"
    ]);

    expect(
      redactArgsForLiveConsole([
        "--data-dir",
        ".zepo-live",
        "--visible",
        "add",
        "Amul Milk 500ml",
        "--report",
        "C:\\Users\\parth\\report.json",
        "--json"
      ])
    ).toEqual([
      "--data-dir",
      "<redacted-data-dir>",
      "--visible",
      "add",
      "<redacted-query>",
      "--report",
      "<redacted-report-path>",
      "--json"
    ]);

    expect(
      redactArgsForLiveConsole(["--data-dir", ".zepo-live", "--visible", "address", "use", "Home Tower 7", "--json"])
    ).toEqual([
      "--data-dir",
      "<redacted-data-dir>",
      "--visible",
      "address",
      "use",
      "<redacted-address-query>",
      "--json"
    ]);
  });
});
