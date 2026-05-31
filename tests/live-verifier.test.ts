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
  buildLiveCommandTimeoutStep,
  buildLiveReportStep,
  createLiveConsoleTextRedactor,
  hasLiveReportMissingCoverage,
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

function automationDiagnosticsPayload() {
  return {
    version: packageJson.version,
    browserAutomation: { ready: true, reasons: [], retryAfterMs: 0 },
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

function statusDiagnosticsPayload() {
  return {
    ...automationDiagnosticsPayload(),
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
        playwrightChromiumPassed: true
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
        productCount: 1
      }
    },
    {
      name: "checkout",
      command: "zepo --data-dir <redacted-data-dir> --visible checkout --json",
      exitCode: 0,
      ok: true,
      summary: {
        status: "checkout_handoff_returned",
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
    note: "Sanitized ZepoCli live verification report. Fixture omits raw workflow data.",
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
    expect(result.stdout).toContain("--remove <query>");
    expect(result.stdout).toContain("--clear");
    expect(result.stdout).toContain("--reorder-last");
    expect(result.stdout).toContain("--choose-add");
    expect(result.stdout).toContain("accepts 10-digit, +91, or leading-0 Indian mobile formats");
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
    expect(result.stdout).not.toContain("prefer npm --silent run verify:live");
  });

  it("waits for timed-out live commands to close before recording timeout failures", () => {
    const script = readFileSync(scriptPath, "utf8");

    expect(script).toContain("COMMAND_TIMEOUT_FORCE_KILL_GRACE_MS = 5_000");
    expect(script).toContain('child.kill("SIGTERM")');
    expect(script).toContain('child.kill("SIGKILL")');
    expect(script).toContain("clearForceKillTimer(forceKill)");
    expect(script).toContain("if (timedOut)");
    expect(script).toContain("reject(liveCommandTimeoutError(options.stepTimeoutMs))");
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

  it("runs normal doctor in live verification so Chromium launch is checked", () => {
    const script = readFileSync(scriptPath, "utf8");

    expect(script).toContain('runStep("doctor", ["--data-dir", options.dataDir, "doctor", "--json"])');
    expect(script).not.toContain('runStep("doctor", ["--data-dir", options.dataDir, "doctor", "--skip-browser", "--json"])');
    expect(script).toContain("browserAutomationReady: payload.browserAutomation?.ready === true");
    expect(script).toContain('const playwrightChromiumCheck = checks.find((check) => check.name === "Playwright Chromium")');
    expect(script).toContain('playwrightChromiumPassed: playwrightChromiumCheck?.status === "pass"');
  });

  it("can forward human product selection to zepo add during live verification", () => {
    const script = readFileSync(scriptPath, "utf8");

    expect(script).toContain("options.chooseAdd");
    expect(script).toContain('addArgs.splice(addArgs.length - 1, 0, "--choose")');
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
      acceptedLiveReport({ dataDir: "<redacted-local-path>" }),
      acceptedLiveReport({ reportPath: "<redacted-local-path>" }),
      acceptedLiveReport({ note: "Report fixture without the sanitizer note." })
    ];

    for (const report of metadataReports) {
      const result = validateLiveReportAcceptance(report, {
        expectedVersion: packageJson.version
      });
      expect(result.accepted).toBe(false);
      expect(result.issues.map((issue) => issue.code)).toContain("live_report_metadata_mismatch");
      expect(JSON.stringify(result.issues)).not.toContain("today");
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
      validateLiveReportAcceptance(manualPartialReport, {
        expectedVersion: packageJson.version
      }).issues.map((issue) => issue.code)
    ).not.toContain("live_report_command_mismatch");

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
  });

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
      { args: ["--data-dir", ".zepo-live", "--report", "   "], message: "--report requires a non-empty value." }
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
      '    "hint": "Run `zepo login` first.",',
      '    "exitCode": 1',
      "  }",
      "}"
    ].join("\n");
    const parsed = parseJsonFromOutput(mixedStderr);

    expect(summarizeCommandError(parsed?.error, mixedStderr)).toEqual({
      code: "no_confirmed_session",
      message: "No confirmed Zepto session found.",
      hint: "Run `zepo login` first."
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
          message: "Status JSON did not include expected session and browser automation fields."
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
        name: "history",
        args: ["--data-dir", ".zepo-live", "--visible", "history", "--json"],
        stdout: "{}",
        error: {
          code: "live_history_contract_mismatch",
          message: "History JSON did not include an order-history array."
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
      paymentStatus: "paid"
    });
    expect(step).toEqual({
      name: "checkout",
      command: "zepo --data-dir <redacted-data-dir> --visible checkout --json",
      exitCode: 1,
      ok: false,
      error: {
        code: "live_checkout_contract_mismatch",
        message: "Checkout JSON did not preserve the Zepto payment and order-placement handoff contract."
      }
    });
  });

  it("accepts checkout live report steps that preserve the payment handoff contract", () => {
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
      summarizePayload: (_name: string, value: { orderStatusCommand?: string }) => ({
        orderStatusCommand: value.orderStatusCommand
      })
    });

    expect(step).toEqual({
      name: "checkout",
      command: "zepo --data-dir <redacted-data-dir> --visible checkout --json",
      exitCode: 0,
      ok: true,
      summary: {
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

  it("fails search live report steps without product results", () => {
    const { step } = buildLiveReportStep({
      name: "search",
      args: ["--data-dir", ".zepo-live", "--visible", "search", "milk", "--json"],
      status: 0,
      stdout: "[]",
      stderr: "",
      summarizePayload: () => {
        throw new Error("empty search payload should not be summarized");
      }
    });

    expect(step).toEqual({
      name: "search",
      command: "zepo --data-dir <redacted-data-dir> --visible search <redacted-query> --json",
      exitCode: 1,
      ok: false,
      error: {
        code: "live_search_contract_mismatch",
        message: "Search JSON did not include any product results."
      }
    });
  });

  it("accepts search live report steps with product results", () => {
    const { step } = buildLiveReportStep({
      name: "search",
      args: ["--data-dir", ".zepo-live", "--visible", "search", "milk", "--json"],
      status: 0,
      stdout: JSON.stringify([{ index: 0, name: "Milk" }]),
      stderr: "",
      summarizePayload: (_name: string, value: unknown[]) => ({
        productCount: value.length
      })
    });

    expect(step).toMatchObject({
      exitCode: 0,
      ok: true,
      summary: {
        productCount: 1
      }
    });
  });

  it("fails add live report steps without product and cart evidence", () => {
    const { step } = buildLiveReportStep({
      name: "add",
      args: ["--data-dir", ".zepo-live", "--visible", "add", "milk", "--json"],
      status: 0,
      stdout: JSON.stringify({ product: { name: "Milk" }, cart: { items: [] } }),
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
        message: "Add JSON did not include an added product and readable cart items."
      }
    });
  });

  it("accepts add live report steps with product and cart evidence", () => {
    const { step } = buildLiveReportStep({
      name: "add",
      args: ["--data-dir", ".zepo-live", "--visible", "add", "milk", "--json"],
      status: 0,
      stdout: JSON.stringify({
        product: { index: 0, name: "Milk" },
        cart: { items: [{ name: "Milk" }] }
      }),
      stderr: "",
      summarizePayload: () => ({ productAdded: true, cartItemCount: 1 })
    });

    expect(step).toMatchObject({
      exitCode: 0,
      ok: true,
      summary: {
        productAdded: true,
        cartItemCount: 1
      }
    });
  });

  it("fails address list live report steps without readable addresses", () => {
    for (const name of ["address add", "address list"]) {
      const { step } = buildLiveReportStep({
        name,
        args: ["--data-dir", ".zepo-live", "--visible", "address", name.endsWith("add") ? "add" : "list", "--json"],
        status: 0,
        stdout: "[]",
        stderr: "",
        summarizePayload: () => {
          throw new Error("empty address payload should not be summarized");
        }
      });

      expect(step.exitCode).toBe(1);
      expect(step.ok).toBe(false);
      expect(step.error).toEqual({
        code: "live_address_contract_mismatch",
        message: "Address JSON did not include any readable addresses."
      });
    }
  });

  it("accepts address list live report steps with readable addresses", () => {
    for (const name of ["address add", "address list"]) {
      const { step } = buildLiveReportStep({
        name,
        args: ["--data-dir", ".zepo-live", "--visible", "address", name.endsWith("add") ? "add" : "list", "--json"],
        status: 0,
        stdout: JSON.stringify([{ text: "Home", selected: true }]),
        stderr: "",
        summarizePayload: () => ({ addressCount: 1 })
      });

      expect(step).toMatchObject({
        exitCode: 0,
        ok: true,
        summary: {
          addressCount: 1
        }
      });
    }
  });

  it("fails address use live report steps without a selected readable address", () => {
    const { step } = buildLiveReportStep({
      name: "address use",
      args: ["--data-dir", ".zepo-live", "--visible", "address", "use", "home", "--json"],
      status: 0,
      stdout: JSON.stringify({ text: "Home", selected: false }),
      stderr: "",
      summarizePayload: () => {
        throw new Error("unselected address payload should not be summarized");
      }
    });

    expect(step).toEqual({
      name: "address use",
      command: "zepo --data-dir <redacted-data-dir> --visible address use <redacted-address-query> --json",
      exitCode: 1,
      ok: false,
      error: {
        code: "live_address_contract_mismatch",
        message: "Address selection JSON did not include a selected readable address."
      }
    });
  });

  it("accepts address use live report steps with a selected readable address", () => {
    const { step } = buildLiveReportStep({
      name: "address use",
      args: ["--data-dir", ".zepo-live", "--visible", "address", "use", "home", "--json"],
      status: 0,
      stdout: JSON.stringify({ text: "Home", selected: true }),
      stderr: "",
      summarizePayload: () => ({ selected: true })
    });

    expect(step).toMatchObject({
      exitCode: 0,
      ok: true,
      summary: {
        selected: true
      }
    });
  });

  it("fails reorder live report steps without cart items", () => {
    const { step } = buildLiveReportStep({
      name: "reorder",
      args: ["--data-dir", ".zepo-live", "--visible", "reorder", "last", "--json"],
      status: 0,
      stdout: JSON.stringify({ items: [] }),
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
  });

  it("accepts reorder live report steps with cart items", () => {
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

  it("fails cart and remove live report steps without cart-shaped JSON", () => {
    for (const name of ["cart", "remove"]) {
      const { step } = buildLiveReportStep({
        name,
        args:
          name === "cart"
            ? ["--data-dir", ".zepo-live", "--visible", "cart", "--json"]
            : ["--data-dir", ".zepo-live", "--visible", "remove", "milk", "--json"],
        status: 0,
        stdout: "{}",
        stderr: "",
        summarizePayload: () => {
          throw new Error("non-cart payload should not be summarized");
        }
      });

      expect(step.exitCode).toBe(1);
      expect(step.ok).toBe(false);
      expect(step.error).toEqual({
        code: "live_cart_contract_mismatch",
        message: "Cart JSON did not include a readable cart item array."
      });
    }
  });

  it("accepts cart and remove live report steps with cart-shaped JSON", () => {
    for (const name of ["cart", "remove"]) {
      const { step } = buildLiveReportStep({
        name,
        args:
          name === "cart"
            ? ["--data-dir", ".zepo-live", "--visible", "cart", "--json"]
            : ["--data-dir", ".zepo-live", "--visible", "remove", "milk", "--json"],
        status: 0,
        stdout: JSON.stringify({ items: [] }),
        stderr: "",
        summarizePayload: () => ({ cartItemCount: 0 })
      });

      expect(step).toMatchObject({
        exitCode: 0,
        ok: true,
        summary: {
          cartItemCount: 0
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
      stdout: "{\"items\":[]}",
      stderr: "",
      summarizePayload: (name: string, value: { items?: unknown[] }) => ({
        name,
        cartItemCount: Array.isArray(value.items) ? value.items.length : -1
      })
    });

    expect(payload).toEqual({ items: [] });
    expect(step).toEqual({
      name: "cart",
      command: "zepo --data-dir <redacted-data-dir> --visible cart --json",
      exitCode: 0,
      ok: true,
      summary: {
        name: "cart",
        cartItemCount: 0
      }
    });
  });

  it("fails live report steps when summary generation fails and redacts sensitive text", () => {
    const { step } = buildLiveReportStep({
      name: "cart",
      args: ["--data-dir", "C:\\Users\\parth\\.zepo-live", "--visible", "cart", "--json"],
      status: 0,
      stdout: "{\"items\":[]}",
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
      "https://example.test/callback?phone=%2B91+98765+43210&otp=%31%32%33%34%35%36&card=4111%201111%201111%201111&upi=abc%40upi&token=raw-token-123&access_token=abc.def.ghi&file=C%3A%2FUsers%2Fparth%2F.zepo-live%2Ftrace.txt";
    const encodedBlob =
      "https%3A%2F%2Fexample.test%2Fcallback%3Fphone%3D%2B91%2098765%2043210%26otp%3D123456%26card%3D4111%201111%201111%201111%26upi%3Dabc%40upi%26token%3Draw-token-123%26file%3DC%3A%2FUsers%2Fparth%2F.zepo-live%2Freport.json";

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
        "Zepto redirect contained https://example.test/callback?phone=<redacted-phone>&otp=<redacted-verification-code>&card=<redacted-payment-number>&upi=<redacted-payment-handle>&token=<redacted-auth-token>&access_token=<redacted-auth-token>&file=<redacted-local-path> and https://example.test/callback?phone=<redacted-phone>&otp=<redacted-verification-code>&card=<redacted-payment-number>&upi=<redacted-payment-handle>&token=<redacted-auth-token>&file=<redacted-local-path>."
    });

    const redacted = redactLiveConsoleText(`Live stderr included ${encodedUrl} and ${encodedBlob}`, []);
    expect(redacted).toContain("phone=<redacted-phone>");
    expect(redacted).toContain("otp=<redacted-verification-code>");
    expect(redacted).toContain("card=<redacted-payment-number>");
    expect(redacted).toContain("upi=<redacted-payment-handle>");
    expect(redacted).toContain("token=<redacted-auth-token>");
    expect(redacted).toContain("access_token=<redacted-auth-token>");
    expect(redacted).toContain("file=<redacted-local-path>");
    expect(redacted).not.toContain("%2B91");
    expect(redacted).not.toContain("%31%32%33");
    expect(redacted).not.toContain("4111%201111");
    expect(redacted).not.toContain("abc%40upi");
    expect(redacted).not.toContain("raw-token-123");
    expect(redacted).not.toContain("abc.def.ghi");
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

  it("redacts sensitive workflow arguments from stored report commands", () => {
    expect(
      redactArgsForLiveReport([
        "--data-dir",
        "C:\\Users\\parth\\.zepo-live",
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
