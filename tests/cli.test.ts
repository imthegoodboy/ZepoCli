import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const rootDir = resolve(import.meta.dirname, "..");
const tsxCli = resolve(rootDir, "node_modules", "tsx", "dist", "cli.mjs");
const cliEntry = resolve(rootDir, "src", "index.ts");
const CLI_TEST_TIMEOUT_MS = 30_000;

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
    expect(result.stdout).toContain("checkout");
  }, CLI_TEST_TIMEOUT_MS);

  it("prints machine-readable status for a fresh data directory", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "zepo-cli-status-"));
    const result = await runCli(["--data-dir", dataDir, "status", "--json"]);

    expect(result.exitCode).toBe(0);
    const status = JSON.parse(result.stdout) as { dataDir: string; hasAuthState: boolean; markedLoggedIn: boolean };
    expect(status.dataDir).toBe(dataDir);
    expect(status.hasAuthState).toBe(false);
    expect(status.markedLoggedIn).toBe(false);
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

  it("returns clean no-session errors for account-dependent commands", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "zepo-cli-session-"));
    const result = await runCli(["--data-dir", dataDir, "cart"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("No confirmed Zepto session found.");
    expect(result.stderr).toContain("Run `zepo login` first.");
    expect(result.stderr).not.toContain("Reading Zepto cart");
  }, CLI_TEST_TIMEOUT_MS);

  it("rejects stale auth state that was not confirmed by login", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "zepo-cli-stale-session-"));
    const storageDir = join(dataDir, "storage");
    mkdirSync(storageDir, { recursive: true });
    writeFileSync(join(storageDir, "auth-state.json"), "{\"cookies\":[]}");

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
