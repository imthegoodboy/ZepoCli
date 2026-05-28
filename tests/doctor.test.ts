import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { HEADLESS_BROWSER_RUN_HISTORY_META_KEY, LAST_ACCESS_CHALLENGE_META_KEY } from "../src/automation/browser.js";
import { closeRuntimeBestEffort, createRuntime } from "../src/config/runtime.js";
import { checkNodeVersion, compareVersions, DoctorService } from "../src/services/doctor.js";

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

describe("doctor service", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("compares semantic Node versions", () => {
    expect(compareVersions("20.11.0", "20.11.0")).toBe(0);
    expect(compareVersions("20.12.0", "20.11.0")).toBeGreaterThan(0);
    expect(compareVersions("20.10.9", "20.11.0")).toBeLessThan(0);
  });

  it("fails unsupported Node versions", () => {
    expect(checkNodeVersion("20.10.0")).toMatchObject({
      name: "Node.js",
      status: "fail"
    });
  });

  it("reports local readiness without launching a browser when skipped", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "zepo-doctor-"));
    const runtime = createRuntime({
      dataDir: tempDir,
      debug: false,
      headless: true
    });

    const report = await new DoctorService(runtime).run({ browser: false });
    closeRuntimeBestEffort(runtime);

    expect(report.ok).toBe(true);
    expect(report.dataDir).toBe(tempDir);
    expect(report.browserLock).toEqual({
      path: runtime.paths.browserLockPath,
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
    expect(report.checks.find((check) => check.name === "Data directory")).toMatchObject({
      status: "pass",
      message: `Writable runtime directories under ${tempDir}`
    });
    expect(report.checks.find((check) => check.name === "Zepto session")).toMatchObject({
      status: "warn"
    });
    expect(report.checks.find((check) => check.name === "Browser automation lock")).toMatchObject({
      status: "pass"
    });
    expect(report.checks.find((check) => check.name === "Headless browser throttle")).toMatchObject({
      status: "pass",
      message: "No recent headless browser run burst was recorded."
    });
    expect(report.checks.find((check) => check.name === "Zepto access challenge")).toMatchObject({
      status: "pass",
      message: "No recent Zepto access challenge was recorded."
    });
    expect(hasDoctorProbe(runtime.paths.dataDir)).toBe(false);
    expect(hasDoctorProbe(runtime.paths.browserProfileDir)).toBe(false);
    expect(hasDoctorProbe(runtime.paths.diagnosticsDir)).toBe(false);
  });

  it("warns when only partial session data exists", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "zepo-doctor-partial-session-"));
    const runtime = createRuntime({
      dataDir: tempDir,
      debug: false,
      headless: true
    });

    writeFileSync(runtime.paths.authStatePath, AUTH_STATE);
    runtime.session.markLoggedIn();

    const report = await new DoctorService(runtime).run({ browser: false });
    closeRuntimeBestEffort(runtime);

    expect(report.ok).toBe(true);
    expect(report.checks.find((check) => check.name === "Zepto session")).toMatchObject({
      status: "warn",
      message: "Partial Zepto session data was found, but login is not confirmed."
    });
  });

  it("does not label browser profile data alone as partial login", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "zepo-doctor-profile-only-"));
    const runtime = createRuntime({
      dataDir: tempDir,
      debug: false,
      headless: true
    });

    writeFileSync(join(runtime.paths.browserProfileDir, "Preferences"), "{}");

    const report = await new DoctorService(runtime).run({ browser: false });
    closeRuntimeBestEffort(runtime);

    expect(report.ok).toBe(true);
    expect(report.checks.find((check) => check.name === "Zepto session")).toMatchObject({
      status: "warn",
      message: "Browser profile data exists, but no saved Zepto login session was found."
    });
  });

  it("warns when a browser automation lock is active", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "zepo-doctor-active-lock-"));
    const runtime = createRuntime({
      dataDir: tempDir,
      debug: false,
      headless: true
    });

    writeFileSync(
      runtime.paths.browserLockPath,
      JSON.stringify({
        token: "active",
        pid: process.pid,
        createdAt: Date.now()
      })
    );

    const report = await new DoctorService(runtime).run({ browser: false });
    closeRuntimeBestEffort(runtime);

    expect(report.ok).toBe(true);
    expect(report.browserLock).toMatchObject({
      path: runtime.paths.browserLockPath,
      present: true,
      stale: false
    });
    expect(report.browserAutomation).toMatchObject({
      ready: false,
      reasons: ["browser_lock_active"],
      retryAfterMs: 0
    });
    expect(report.checks.find((check) => check.name === "Browser automation lock")).toMatchObject({
      status: "warn",
      message: "Another ZepoCli browser command appears to be using this data directory."
    });
  });

  it("warns when a browser automation lock is stale", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "zepo-doctor-stale-lock-"));
    const runtime = createRuntime({
      dataDir: tempDir,
      debug: false,
      headless: true
    });

    writeFileSync(
      runtime.paths.browserLockPath,
      JSON.stringify({
        token: "stale",
        pid: 1,
        createdAt: Date.now() - 20 * 60 * 1_000
      })
    );

    const report = await new DoctorService(runtime).run({ browser: false });
    closeRuntimeBestEffort(runtime);

    expect(report.ok).toBe(true);
    expect(report.browserLock).toMatchObject({
      path: runtime.paths.browserLockPath,
      present: true,
      stale: true
    });
    expect(report.checks.find((check) => check.name === "Browser automation lock")).toMatchObject({
      status: "warn",
      message: "A stale browser automation lock exists for this data directory."
    });
  });

  it("warns when headless automation is cooling down after a Zepto access challenge", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "zepo-doctor-access-challenge-"));
    const runtime = createRuntime({
      dataDir: tempDir,
      debug: false,
      headless: true
    });

    runtime.sqlite.setMeta(LAST_ACCESS_CHALLENGE_META_KEY, String(Date.now()));

    const report = await new DoctorService(runtime).run({ browser: false });
    closeRuntimeBestEffort(runtime);

    expect(report.ok).toBe(true);
    expect(report.accessChallenge).toMatchObject({
      detected: true,
      cooldownActive: true
    });
    expect(report.browserAutomation).toMatchObject({
      ready: false,
      reasons: ["zepto_access_cooldown"]
    });
    expect(report.browserAutomation.retryAfterMs).toBeGreaterThan(0);
    expect(report.checks.find((check) => check.name === "Zepto access challenge")).toMatchObject({
      status: "warn",
      message: "Recent Zepto verification or blocking was detected; headless automation is cooling down."
    });
  });

  it("warns when headless browser automation is cooling down after a rapid burst", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "zepo-doctor-headless-throttle-"));
    const runtime = createRuntime({
      dataDir: tempDir,
      debug: false,
      headless: true
    });

    runtime.sqlite.setMeta(
      HEADLESS_BROWSER_RUN_HISTORY_META_KEY,
      JSON.stringify(Array.from({ length: 8 }, (_, index) => Date.now() - index))
    );

    const report = await new DoctorService(runtime).run({ browser: false });
    closeRuntimeBestEffort(runtime);

    expect(report.ok).toBe(true);
    expect(report.headlessBrowserThrottle).toMatchObject({
      recentRuns: 8,
      throttleActive: true
    });
    expect(report.browserAutomation).toMatchObject({
      ready: false,
      reasons: ["headless_browser_throttle"]
    });
    expect(report.browserAutomation.retryAfterMs).toBeGreaterThan(0);
    expect(report.checks.find((check) => check.name === "Headless browser throttle")).toMatchObject({
      status: "warn",
      message: "Many recent headless Zepto browser commands were detected; headless automation is cooling down."
    });
  });
});

function hasDoctorProbe(path: string): boolean {
  return readdirSync(path).some((entry) => entry.startsWith(".doctor-"));
}
