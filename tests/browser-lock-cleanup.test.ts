import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { closeRuntimeBestEffort, createRuntime, type AppRuntime } from "../src/config/runtime.js";

const { launchPersistentContext } = vi.hoisted(() => ({
  launchPersistentContext: vi.fn(async () => {
    throw new Error("mock chromium launch failed");
  })
}));

vi.mock("playwright", () => ({
  chromium: {
    launchPersistentContext
  }
}));

describe("browser lock cleanup", () => {
  let tempDir: string | undefined;
  let runtime: AppRuntime | undefined;

  afterEach(() => {
    if (runtime) {
      closeRuntimeBestEffort(runtime);
      runtime = undefined;
    }

    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }

    launchPersistentContext.mockClear();
  });

  it("removes a recovered stale browser lock when browser launch fails", async () => {
    const { BrowserAutomation, getBrowserRunLockStatus } = await import("../src/automation/browser.js");
    tempDir = mkdtempSync(join(tmpdir(), "zepo-browser-launch-lock-"));
    const lockPath = join(tempDir, "browser.lock");
    writeFileSync(
      lockPath,
      JSON.stringify({
        token: "dead-owner",
        pid: 99_999_999,
        createdAt: Date.now() - 60_000
      })
    );

    runtime = createRuntime({ dataDir: tempDir, timeoutMs: 1_000 });
    const automation = new BrowserAutomation(runtime);

    await expect(automation.withPage({ requireSession: false }, async () => "unreachable")).rejects.toMatchObject({
      code: "browser_launch_failed"
    });

    expect(launchPersistentContext).toHaveBeenCalledOnce();
    expect(existsSync(lockPath)).toBe(false);
    expect(getBrowserRunLockStatus(lockPath)).toEqual({
      path: lockPath,
      present: false,
      stale: false
    });
  });
});
