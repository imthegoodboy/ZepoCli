import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import packageJson from "../package.json" with { type: "json" };

const execFileAsync = promisify(execFile);
const rootDir = resolve(import.meta.dirname, "..");
const tsxCli = resolve(rootDir, "node_modules", "tsx", "dist", "cli.mjs");
const cliEntry = resolve(rootDir, "src", "index.ts");
const CLI_TEST_TIMEOUT_MS = 30_000;
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
    };
    expect(status.dataDir).toBe(dataDir);
    expect(status.hasAuthState).toBe(false);
    expect(status.markedLoggedIn).toBe(false);
    expect(status.confirmedSession).toBe(false);
  }, CLI_TEST_TIMEOUT_MS);

  it("prints machine-readable logout output", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "zepo-cli-logout-"));
    const result = await runCli(["--data-dir", dataDir, "logout", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ sessionRemoved: true });
    expect(result.stderr).toBe("");
  }, CLI_TEST_TIMEOUT_MS);

  it("runs doctor without browser launch for fast local readiness", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "zepo-cli-doctor-"));
    const result = await runCli(["--data-dir", dataDir, "doctor", "--skip-browser", "--json"]);

    expect(result.exitCode).toBe(0);
    const report = JSON.parse(result.stdout) as { ok: boolean; checks: Array<{ name: string; status: string }> };
    expect(report.ok).toBe(true);
    expect(report.checks.map((check) => check.name)).toEqual(["Node.js", "Data directory", "SQLite", "Zepto session"]);
    expect(report.checks.find((check) => check.name === "Zepto session")?.status).toBe("warn");
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
        message: string;
        exitCode: number;
        issues: Array<{ path: string; message: string }>;
      };
    };
    expect(payload.ok).toBe(false);
    expect(payload.error.type).toBe("invalid_input");
    expect(payload.error.message).toBe("Invalid input.");
    expect(payload.error.exitCode).toBe(1);
    expect(payload.error.issues[0]?.path).toBe("timeout");
  }, CLI_TEST_TIMEOUT_MS);

  it("rejects invalid search limit before opening a browser", async () => {
    const result = await runCli(["search", "milk", "--limit", "abc"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Search limit must be an integer from 1 to 50.");
    expect(result.stderr).toContain("zepo search milk --limit 10");
  }, CLI_TEST_TIMEOUT_MS);

  it("rejects invalid add quantity before checking session", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "zepo-cli-quantity-"));
    const result = await runCli(["--data-dir", dataDir, "add", "milk", "--quantity", "abc"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Quantity must be an integer from 1 to 50.");
    expect(result.stderr).toContain("zepo add milk --quantity 2");
    expect(result.stderr).not.toContain("No confirmed Zepto session found.");
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
        message: string;
        hint?: string;
        exitCode: number;
      };
    };
    expect(payload).toEqual({
      ok: false,
      error: {
        type: "user_error",
        message: "Quantity must be an integer from 1 to 50.",
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
          message: string;
          hint?: string;
          exitCode: number;
        };
      };
      expect(payload.ok).toBe(false);
      expect(payload.error.type).toBe("user_error");
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
        message: string;
        hint?: string;
        exitCode: number;
      };
    };
    expect(payload.ok).toBe(false);
    expect(payload.error.type).toBe("user_error");
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
        message: string;
        hint?: string;
        exitCode: number;
      };
    };
    expect(payload.ok).toBe(false);
    expect(payload.error.type).toBe("user_error");
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
      timeout: 30_000
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
