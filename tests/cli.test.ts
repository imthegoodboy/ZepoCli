import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import packageJson from "../package.json" with { type: "json" };
import { HEADLESS_BROWSER_RUN_HISTORY_META_KEY, LAST_ACCESS_CHALLENGE_META_KEY } from "../src/automation/browser.js";
import { resolveAppPaths } from "../src/config/paths.js";
import { SqliteStore } from "../src/storage/sqlite.js";

const execFileAsync = promisify(execFile);
const rootDir = resolve(import.meta.dirname, "..");
const tsxCli = resolve(rootDir, "node_modules", "tsx", "dist", "cli.mjs");
const cliEntry = resolve(rootDir, "src", "index.ts");
const CLI_TEST_TIMEOUT_MS = 60_000;
const AUTH_STATE = JSON.stringify({
  cookies: [
    {
      name: "sid",
      value: "1",
      domain: "www.zepto.com",
      path: "/"
    }
  ],
  origins: []
});

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

describe("CLI command smokes", () => {
  let dataDir: string | undefined;

  afterEach(() => {
    if (dataDir && existsSync(dataDir)) {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("prints the production command surface", async () => {
    const result = await runCli(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("login [options]");
    expect(result.stdout).toContain("status [options]");
    expect(result.stdout).toContain("doctor [options]");
    expect(result.stdout).toContain("--json");
    expect(result.stdout).toContain("--no-input");
    expect(result.stdout).toContain("checkout");
  }, CLI_TEST_TIMEOUT_MS);

  it("prints the package version", async () => {
    const result = await runCli(["--version"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe(packageJson.version);
    expect(result.stderr).toBe("");
  }, CLI_TEST_TIMEOUT_MS);

  it("prints machine-readable status for a fresh data directory", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "zepo-cli-status-"));
    const result = await runCli(["--data-dir", dataDir, "status", "--json"]);

    expect(result.exitCode).toBe(0);
    const status = JSON.parse(result.stdout) as {
      dataDir: string;
      hasAuthState: boolean;
      markedLoggedIn: boolean;
      confirmedSession: boolean;
      browserLock: {
        path: string;
        present: boolean;
        stale: boolean;
      };
      browserAutomation: {
        ready: boolean;
        reasons: string[];
        retryAfterMs: number;
        hint?: string;
      };
      headlessBrowserThrottle: {
        windowMs: number;
        limit: number;
        recentRuns: number;
        throttleActive: boolean;
        retryAfterMs: number;
      };
      accessChallenge: {
        detected: boolean;
        cooldownActive: boolean;
        retryAfterMs: number;
      };
      cache: {
        searches: number;
        cartSnapshots: number;
        addresses: number;
        orders: number;
      };
    };
    expect(status.dataDir).toBe(dataDir);
    expect(status.hasAuthState).toBe(false);
    expect(status.markedLoggedIn).toBe(false);
    expect(status.confirmedSession).toBe(false);
    expect(status.browserLock).toEqual({
      path: join(dataDir, "browser.lock"),
      present: false,
      stale: false
    });
    expect(status.browserAutomation).toEqual({
      ready: true,
      reasons: [],
      retryAfterMs: 0
    });
    expect(status.headlessBrowserThrottle).toEqual({
      windowMs: 600_000,
      limit: 8,
      recentRuns: 0,
      throttleActive: false,
      retryAfterMs: 0
    });
    expect(status.accessChallenge).toEqual({
      detected: false,
      cooldownActive: false,
      retryAfterMs: 0
    });
    expect(status.cache).toEqual({
      searches: 0,
      cartSnapshots: 0,
      addresses: 0,
      orders: 0
    });
  }, CLI_TEST_TIMEOUT_MS);

  it("honors global JSON output before the subcommand", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "zepo-cli-global-json-"));
    const result = await runCli(["--data-dir", dataDir, "--json", "status"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const status = JSON.parse(result.stdout) as {
      dataDir: string;
      confirmedSession: boolean;
    };
    expect(status.dataDir).toBe(dataDir);
    expect(status.confirmedSession).toBe(false);
  }, CLI_TEST_TIMEOUT_MS);

  it("skips live status browser work when no confirmed local session exists", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "zepo-cli-status-live-skip-"));
    const result = await runCli(["--data-dir", dataDir, "status", "--live", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const status = JSON.parse(result.stdout) as {
      confirmedSession: boolean;
      liveSession: {
        checked: boolean;
        state: string;
        demotedLocalSession: boolean;
        message: string;
        hint?: string;
      };
    };
    expect(status.confirmedSession).toBe(false);
    expect(status.liveSession).toMatchObject({
      checked: false,
      state: "skipped",
      demotedLocalSession: false,
      message: "No confirmed local Zepto session is available for live verification.",
      hint: "Run `zepo login` first."
    });
  }, CLI_TEST_TIMEOUT_MS);

  it("prints browser lock diagnostics in machine-readable status", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "zepo-cli-status-lock-"));
    writeFileSync(
      join(dataDir, "browser.lock"),
      JSON.stringify({
        token: "active",
        pid: process.pid,
        createdAt: Date.now()
      })
    );

    const result = await runCli(["--data-dir", dataDir, "status", "--json"]);

    expect(result.exitCode).toBe(0);
    const status = JSON.parse(result.stdout) as {
      browserLock: {
        path: string;
        present: boolean;
        stale: boolean;
        pid?: number;
        createdAt?: string;
      };
      browserAutomation: {
        ready: boolean;
        reasons: string[];
        retryAfterMs: number;
        hint?: string;
      };
    };
    expect(status.browserLock).toMatchObject({
      path: join(dataDir, "browser.lock"),
      present: true,
      stale: false,
      pid: process.pid
    });
    expect(status.browserLock.createdAt).toBeTypeOf("string");
    expect(status.browserAutomation).toMatchObject({
      ready: false,
      reasons: ["browser_lock_active"],
      retryAfterMs: 0
    });
    expect(status.browserAutomation.hint).toContain("wait for the active browser command");
  }, CLI_TEST_TIMEOUT_MS);

  it("prints machine-readable logout output", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "zepo-cli-logout-"));
    const result = await runCli(["--data-dir", dataDir, "logout", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      status: "session_removed",
      sessionRemoved: true,
      cacheCleared: true,
      next: "Run `zepo login` before account-dependent commands."
    });
    expect(result.stderr).toBe("");
  }, CLI_TEST_TIMEOUT_MS);

  it("does not clear local session data while a browser command is active", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "zepo-cli-logout-lock-"));
    const storageDir = join(dataDir, "storage");
    const profileFile = join(storageDir, "browser-profile", "Default", "Cookies");
    mkdirSync(join(storageDir, "browser-profile", "Default"), { recursive: true });
    writeFileSync(join(storageDir, "auth-state.json"), AUTH_STATE);
    writeFileSync(profileFile, "cookie-data");
    writeFileSync(
      join(dataDir, "browser.lock"),
      JSON.stringify({
        token: "active",
        pid: process.pid,
        createdAt: Date.now()
      })
    );

    const result = await runCli(["--data-dir", dataDir, "logout", "--json"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const payload = JSON.parse(result.stderr) as {
      ok: boolean;
      error: {
        type: string;
        code?: string;
        message: string;
        hint?: string;
      };
    };
    expect(payload.ok).toBe(false);
    expect(payload.error.type).toBe("user_error");
    expect(payload.error.code).toBe("browser_lock_active");
    expect(payload.error.message).toBe("Another ZepoCli browser command is already running for this data directory.");
    expect(payload.error.hint).toContain("before running `zepo logout`");
    expect(existsSync(join(storageDir, "auth-state.json"))).toBe(true);
    expect(existsSync(profileFile)).toBe(true);
  }, CLI_TEST_TIMEOUT_MS);

  it("runs doctor without browser launch for fast local readiness", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "zepo-cli-doctor-"));
    const result = await runCli(["--data-dir", dataDir, "doctor", "--skip-browser", "--json"]);

    expect(result.exitCode).toBe(0);
    const report = JSON.parse(result.stdout) as {
      ok: boolean;
      dataDir: string;
      browserLock: {
        path: string;
        present: boolean;
        stale: boolean;
      };
      browserAutomation: {
        ready: boolean;
        reasons: string[];
        retryAfterMs: number;
      };
      headlessBrowserThrottle: {
        windowMs: number;
        limit: number;
        recentRuns: number;
        throttleActive: boolean;
        retryAfterMs: number;
      };
      accessChallenge: {
        detected: boolean;
        cooldownActive: boolean;
        retryAfterMs: number;
      };
      checks: Array<{ name: string; status: string }>;
    };
    expect(report.ok).toBe(true);
    expect(report.dataDir).toBe(dataDir);
    expect(report.browserLock).toEqual({
      path: join(dataDir, "browser.lock"),
      present: false,
      stale: false
    });
    expect(report.browserAutomation).toEqual({
      ready: true,
      reasons: [],
      retryAfterMs: 0
    });
    expect(report.headlessBrowserThrottle).toEqual({
      windowMs: 600_000,
      limit: 8,
      recentRuns: 0,
      throttleActive: false,
      retryAfterMs: 0
    });
    expect(report.accessChallenge).toEqual({
      detected: false,
      cooldownActive: false,
      retryAfterMs: 0
    });
    expect(report.checks.map((check) => check.name)).toEqual([
      "Node.js",
      "Data directory",
      "SQLite",
      "Zepto session",
      "Browser automation lock",
      "Headless browser throttle",
      "Zepto access challenge"
    ]);
    expect(report.checks.find((check) => check.name === "Zepto session")?.status).toBe("warn");
    expect(report.checks.find((check) => check.name === "Browser automation lock")?.status).toBe("pass");
    expect(report.checks.find((check) => check.name === "Headless browser throttle")?.status).toBe("pass");
    expect(report.checks.find((check) => check.name === "Zepto access challenge")?.status).toBe("pass");
  }, CLI_TEST_TIMEOUT_MS);

  it("rejects invalid global timeout before opening a browser", async () => {
    const result = await runCli(["--timeout", "abc", "status"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Invalid input.");
    expect(result.stderr).toContain("timeout");
  }, CLI_TEST_TIMEOUT_MS);

  it("prints machine-readable validation errors when JSON output is requested", async () => {
    const result = await runCli(["--timeout", "abc", "status", "--json"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const payload = JSON.parse(result.stderr) as {
      ok: boolean;
      error: {
        type: string;
        code?: string;
        message: string;
        exitCode: number;
        issues: Array<{ path: string; message: string }>;
      };
    };
    expect(payload.ok).toBe(false);
    expect(payload.error.type).toBe("invalid_input");
    expect(payload.error.code).toBe("invalid_input");
    expect(payload.error.message).toBe("Invalid input.");
    expect(payload.error.exitCode).toBe(1);
    expect(payload.error.issues[0]?.path).toBe("timeout");
  }, CLI_TEST_TIMEOUT_MS);

  it("rejects blank data directories before runtime setup", async () => {
    const result = await runCli(["--data-dir", "   ", "status", "--json"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const payload = JSON.parse(result.stderr) as {
      ok: boolean;
      error: {
        type: string;
        code?: string;
        message: string;
        exitCode: number;
        issues: Array<{ path: string; message: string }>;
      };
    };
    expect(payload.ok).toBe(false);
    expect(payload.error.type).toBe("invalid_input");
    expect(payload.error.code).toBe("invalid_input");
    expect(payload.error.message).toBe("Invalid input.");
    expect(payload.error.exitCode).toBe(1);
    expect(payload.error.issues[0]).toEqual({
      path: "dataDir",
      message: "must not be blank"
    });
  }, CLI_TEST_TIMEOUT_MS);

  it("prints machine-readable parser errors for unknown commands in JSON mode", async () => {
    const result = await runCli(["--json", "not-a-command"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const payload = JSON.parse(result.stderr) as {
      ok: boolean;
      error: {
        type: string;
        code?: string;
        message: string;
        exitCode: number;
      };
    };
    expect(payload.ok).toBe(false);
    expect(payload.error.type).toBe("invalid_input");
    expect(payload.error.code).toBe("invalid_input");
    expect(payload.error.message).toBe("error: unknown command 'not-a-command'");
    expect(payload.error.exitCode).toBe(1);
  }, CLI_TEST_TIMEOUT_MS);

  it("prints machine-readable parser errors for unknown options in JSON mode", async () => {
    const result = await runCli(["--json", "status", "--bad-option"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const payload = JSON.parse(result.stderr) as {
      ok: boolean;
      error: {
        type: string;
        code?: string;
        message: string;
        exitCode: number;
      };
    };
    expect(payload.ok).toBe(false);
    expect(payload.error.type).toBe("invalid_input");
    expect(payload.error.code).toBe("invalid_input");
    expect(payload.error.message).toBe("error: unknown option '--bad-option'");
    expect(payload.error.exitCode).toBe(1);
  }, CLI_TEST_TIMEOUT_MS);

  it("prints machine-readable parser errors for nested command mistakes in JSON mode", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "zepo-cli-nested-json-"));
    for (const testCase of [
      {
        args: ["--data-dir", dataDir, "--json", "address", "use"],
        type: "invalid_input",
        message: "error: missing required argument 'query'"
      },
      {
        args: ["--data-dir", dataDir, "--json", "address", "nope"],
        type: "invalid_input",
        message: "error: unknown command 'nope'"
      },
      {
        args: ["--data-dir", dataDir, "reorder", "previous", "--json"],
        type: "user_error",
        message: "Only `zepo reorder last` is supported."
      }
    ]) {
      const result = await runCli(testCase.args);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      const payload = JSON.parse(result.stderr) as {
        ok: boolean;
        error: {
          type: string;
          code?: string;
          message: string;
          exitCode: number;
        };
      };
      expect(payload.ok).toBe(false);
      expect(payload.error.type).toBe(testCase.type);
      expect(payload.error.code).toBe(testCase.type === "invalid_input" ? "invalid_input" : "unsupported_operation");
      expect(payload.error.message).toBe(testCase.message);
      expect(payload.error.exitCode).toBe(1);
    }
  }, CLI_TEST_TIMEOUT_MS);

  it("prints machine-readable runtime setup errors for unusable data directories", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "zepo-cli-data-file-parent-"));
    const blockedPath = join(dataDir, "blocked-file");
    writeFileSync(blockedPath, "not a directory");
    const result = await runCli(["--data-dir", blockedPath, "status", "--json"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const payload = JSON.parse(result.stderr) as {
      ok: boolean;
      error: {
        type: string;
        code?: string;
        message: string;
        hint?: string;
        exitCode: number;
      };
    };
    expect(payload.ok).toBe(false);
    expect(payload.error.type).toBe("user_error");
    expect(payload.error.message).toContain("Could not initialize local ZepoCli storage");
    expect(payload.error.message).toContain(blockedPath);
    expect(payload.error.hint).toContain("zepo --data-dir <path> doctor");
    expect(payload.error.exitCode).toBe(1);
  }, CLI_TEST_TIMEOUT_MS);

  it("rejects invalid search limit before opening a browser", async () => {
    const result = await runCli(["search", "milk", "--limit", "abc"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Search limit must be an integer from 1 to 50.");
    expect(result.stderr).toContain("zepo search milk --limit 10");
  }, CLI_TEST_TIMEOUT_MS);

  it("prints machine-readable search limit errors before browser work", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "zepo-cli-search-limit-"));
    const result = await runCli(["--data-dir", dataDir, "search", "milk", "--limit", "0", "--json"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const payload = JSON.parse(result.stderr) as {
      ok: boolean;
      error: {
        type: string;
        message: string;
        hint?: string;
        exitCode: number;
      };
    };
    expect(payload).toEqual({
      ok: false,
      error: {
        type: "user_error",
        code: "invalid_input",
        message: "Search limit must be an integer from 1 to 50.",
        hint: "Use a value like `zepo search milk --limit 10`.",
        exitCode: 1
      }
    });

    const statusResult = await runCli(["--data-dir", dataDir, "status", "--json"]);
    const status = JSON.parse(statusResult.stdout) as {
      hasAuthState: boolean;
      hasBrowserProfileData: boolean;
      headlessBrowserThrottle: {
        recentRuns: number;
      };
      accessChallenge: {
        detected: boolean;
      };
    };
    expect(status.hasAuthState).toBe(false);
    expect(status.hasBrowserProfileData).toBe(false);
    expect(status.headlessBrowserThrottle.recentRuns).toBe(0);
    expect(status.accessChallenge.detected).toBe(false);
  }, CLI_TEST_TIMEOUT_MS);

  it("prints retry timing for local safety stops before browser work", async () => {
    for (const testCase of [
      {
        dataDirPrefix: "zepo-cli-access-cooldown-",
        setup: (dir: string) => setRuntimeMeta(dir, LAST_ACCESS_CHALLENGE_META_KEY, String(Date.now())),
        code: "zepto_access_cooldown",
        message: "Recent Zepto verification or block was detected; pausing headless browser automation."
      },
      {
        dataDirPrefix: "zepo-cli-headless-throttle-",
        setup: (dir: string) =>
          setRuntimeMeta(
            dir,
            HEADLESS_BROWSER_RUN_HISTORY_META_KEY,
            JSON.stringify(Array.from({ length: 8 }, (_, index) => Date.now() - index))
          ),
        code: "headless_browser_throttle",
        message: "Headless browser automation is cooling down after many recent Zepto commands."
      }
    ]) {
      dataDir = mkdtempSync(join(tmpdir(), testCase.dataDirPrefix));
      testCase.setup(dataDir);

      const result = await runCli(["--data-dir", dataDir, "search", "milk", "--json"]);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(existsSync(join(dataDir, "browser.lock"))).toBe(false);
      const payload = JSON.parse(result.stderr) as {
        ok: boolean;
        error: {
          type: string;
          code?: string;
          message: string;
          hint?: string;
          exitCode: number;
          retryAfterMs?: number;
        };
      };
      expect(payload.ok).toBe(false);
      expect(payload.error.type).toBe("user_error");
      expect(payload.error.code).toBe(testCase.code);
      expect(payload.error.message).toBe(testCase.message);
      expect(payload.error.hint).toContain("--visible");
      expect(payload.error.exitCode).toBe(1);
      expect(payload.error.retryAfterMs).toBeGreaterThan(0);

      rmSync(dataDir, { recursive: true, force: true });
      dataDir = undefined;
    }
  }, CLI_TEST_TIMEOUT_MS * 2);

  it("rejects invalid add quantity before checking session", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "zepo-cli-quantity-"));
    const result = await runCli(["--data-dir", dataDir, "add", "milk", "--quantity", "abc"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Quantity must be an integer from 1 to 12.");
    expect(result.stderr).toContain("zepo add milk --quantity 2");
    expect(result.stderr).not.toContain("No confirmed Zepto session found.");
  }, CLI_TEST_TIMEOUT_MS);

  it("rejects invalid login phone prefill before opening the browser", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "zepo-cli-phone-"));
    const result = await runCli(["--data-dir", dataDir, "login", "--phone", "abc", "--json"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const payload = JSON.parse(result.stderr) as {
      ok: boolean;
      error: {
        type: string;
        code?: string;
        message: string;
        hint?: string;
        exitCode: number;
      };
    };
    expect(payload).toEqual({
      ok: false,
      error: {
        type: "user_error",
        code: "invalid_input",
        message: "Phone number must be a valid 10-digit Indian mobile number.",
        hint: "Use a value like `zepo login --phone 9876543210`.",
        exitCode: 1
      }
    });
  }, CLI_TEST_TIMEOUT_MS);

  it("prints machine-readable user errors when JSON output is requested", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "zepo-cli-json-error-"));
    const result = await runCli(["--data-dir", dataDir, "add", "milk", "--quantity", "abc", "--json"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const payload = JSON.parse(result.stderr) as {
      ok: boolean;
      error: {
        type: string;
        code?: string;
        message: string;
        hint?: string;
        exitCode: number;
      };
    };
    expect(payload).toEqual({
      ok: false,
      error: {
        type: "user_error",
        code: "invalid_input",
        message: "Quantity must be an integer from 1 to 12.",
        hint: "Use a value like `zepo add milk --quantity 2`.",
        exitCode: 1
      }
    });
  }, CLI_TEST_TIMEOUT_MS * 2);

  it("fails before prompts when no-input is used with browser handoff commands", async () => {
    for (const testCase of [
      {
        args: ["login", "--json"],
        message: "Zepto login requires interactive input."
      },
      {
        args: ["address", "add", "--json"],
        message: "Zepto address add requires interactive input."
      },
      {
        args: ["checkout", "--json"],
        message: "Zepto checkout requires interactive input."
      }
    ]) {
      dataDir = mkdtempSync(join(tmpdir(), "zepo-cli-no-input-"));
      const result = await runCli(["--data-dir", dataDir, "--no-input", ...testCase.args]);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      const payload = JSON.parse(result.stderr) as {
        ok: boolean;
        error: {
          type: string;
          code?: string;
          message: string;
          hint?: string;
          exitCode: number;
        };
      };
      expect(payload.ok).toBe(false);
      expect(payload.error.type).toBe("user_error");
      expect(payload.error.code).toBe("interactive_input_required");
      expect(payload.error.message).toBe(testCase.message);
      expect(payload.error.hint).toContain("without `--no-input`");
      expect(payload.error.exitCode).toBe(1);
      rmSync(dataDir, { recursive: true, force: true });
      dataDir = undefined;
    }
  }, CLI_TEST_TIMEOUT_MS * 2);

  it("fails before browser work when no-input is combined with choose", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "zepo-cli-no-input-choose-"));
    const result = await runCli(["--data-dir", dataDir, "--no-input", "add", "milk", "--choose", "--json"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const payload = JSON.parse(result.stderr) as {
      ok: boolean;
      error: {
        type: string;
        code?: string;
        message: string;
        hint?: string;
        exitCode: number;
      };
    };
    expect(payload.ok).toBe(false);
    expect(payload.error.type).toBe("user_error");
    expect(payload.error.code).toBe("interactive_input_required");
    expect(payload.error.message).toBe("Interactive product selection requires input.");
    expect(payload.error.hint).toContain("remove `--choose`");
    expect(payload.error.exitCode).toBe(1);
    expect(result.stderr).not.toContain("No confirmed Zepto session found.");
  }, CLI_TEST_TIMEOUT_MS);

  it("returns clean no-session errors for account-dependent commands", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "zepo-cli-session-"));
    const result = await runCli(["--data-dir", dataDir, "cart"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("No confirmed Zepto session found.");
    expect(result.stderr).toContain("Run `zepo login` first.");
    expect(result.stderr).not.toContain("Reading Zepto cart");
  }, CLI_TEST_TIMEOUT_MS);

  it("prints machine-readable no-session errors when JSON output is requested", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "zepo-cli-json-session-"));
    const result = await runCli(["--data-dir", dataDir, "cart", "--json"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const payload = JSON.parse(result.stderr) as {
      ok: boolean;
      error: {
        type: string;
        code?: string;
        message: string;
        hint?: string;
        exitCode: number;
      };
    };
    expect(payload.ok).toBe(false);
    expect(payload.error.type).toBe("user_error");
    expect(payload.error.code).toBe("no_confirmed_session");
    expect(payload.error.message).toBe("No confirmed Zepto session found.");
    expect(payload.error.hint).toBe("Run `zepo login` first.");
    expect(payload.error.exitCode).toBe(1);
  }, CLI_TEST_TIMEOUT_MS);

  it("rejects stale auth state that was not confirmed by login", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "zepo-cli-stale-session-"));
    const storageDir = join(dataDir, "storage");
    mkdirSync(storageDir, { recursive: true });
    writeFileSync(join(storageDir, "auth-state.json"), AUTH_STATE);

    const result = await runCli(["--data-dir", dataDir, "cart"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("No confirmed Zepto session found.");
    expect(result.stderr).toContain("Run `zepo login` again");
  }, CLI_TEST_TIMEOUT_MS);
});

async function runCli(args: string[]): Promise<CliResult> {
  try {
    const output = await execFileAsync(process.execPath, [tsxCli, cliEntry, ...args], {
      cwd: rootDir,
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        NO_COLOR: "1"
      },
      timeout: CLI_TEST_TIMEOUT_MS
    });

    return {
      exitCode: 0,
      stdout: output.stdout,
      stderr: output.stderr
    };
  } catch (error) {
    if (isExecError(error)) {
      return {
        exitCode: typeof error.code === "number" ? error.code : 1,
        stdout: error.stdout ?? "",
        stderr: error.stderr ?? ""
      };
    }

    throw error;
  }
}

function isExecError(error: unknown): error is { code?: number; stdout?: string; stderr?: string } {
  return typeof error === "object" && error !== null && ("stdout" in error || "stderr" in error);
}

function setRuntimeMeta(dataDir: string, key: string, value: string): void {
  const sqlite = new SqliteStore(resolveAppPaths(dataDir).dbPath);
  try {
    sqlite.setMeta(key, value);
  } finally {
    sqlite.close();
  }
}
