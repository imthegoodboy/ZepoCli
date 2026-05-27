import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createRuntime } from "../src/config/runtime.js";
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
    runtime.sqlite.close();

    expect(report.ok).toBe(true);
    expect(report.checks.map((check) => check.name)).toEqual([
      "Node.js",
      "Data directory",
      "SQLite",
      "Zepto session"
    ]);
    expect(report.checks.find((check) => check.name === "Zepto session")).toMatchObject({
      status: "warn"
    });
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
    runtime.sqlite.close();

    expect(report.ok).toBe(true);
    expect(report.checks.find((check) => check.name === "Zepto session")).toMatchObject({
      status: "warn",
      message: "Partial Zepto session data was found, but login is not confirmed."
    });
  });
});
