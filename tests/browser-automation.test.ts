import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  acquireBrowserRunLock,
  ACCESS_CHALLENGE_COOLDOWN_MS,
  assertHeadlessBrowserRunBudget,
  assertNoAccessChallenge,
  assertNoAccessChallengeCooldown,
  assertNoAccessChallengeResponse,
  buildPersistentContextOptions,
  closeBrowserContextBestEffort,
  computeAccessChallengeCooldownDelay,
  computeBrowserPacingDelay,
  computeManualAccessChallengeWaitMs,
  configurePageAccessChallengeHandling,
  clearPageAccessChallengeHandling,
  getAccessChallengeCooldownStatus,
  getBrowserAutomationReadiness,
  getBrowserRunLockStatus,
  getHeadlessBrowserThrottleStatus,
  installProcessSignalCleanup,
  isAccessChallengeText,
  isAccessChallengeError,
  isAccessProtectionError,
  isLoginRequiredPage,
  isLoginRequiredText,
  recordHeadlessBrowserRun,
  pageHadAccessChallenge,
  shouldAllowManualAccessChallengeResolution,
  isStaleBrowserRunLock,
  shouldCheckExpiredSession,
  shouldCaptureBrowserFailure,
  shouldSaveBrowserState,
  toBrowserLaunchError,
  withClosingBrowserContext
} from "../src/automation/browser.js";
import { UserFacingError } from "../src/utils/errors.js";

describe("browser automation helpers", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    vi.useRealTimers();
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("converts Playwright launch failures into actionable user errors", () => {
    const error = toBrowserLaunchError(new Error("Executable doesn't exist at C:/playwright/chromium.exe\nPlease run install"));

    expect(error).toBeInstanceOf(UserFacingError);
    expect(error.message).toBe("Could not launch Playwright Chromium.");
    expect(error.code).toBe("browser_launch_failed");
    expect(error.hint).toContain("npm run prepare:browsers");
    expect(error.hint).toContain("zepo doctor");
    expect(error.hint).toContain("Executable doesn't exist");
  });

  it("handles non-Error launch failures", () => {
    const error = toBrowserLaunchError("profile path is locked");

    expect(error.message).toBe("Could not launch Playwright Chromium.");
    expect(error.hint).toContain("profile path is locked");
  });

  it("captures debug failure artifacts only when debug and flow settings allow it", () => {
    expect(shouldCaptureBrowserFailure({}, false)).toBe(false);
    expect(shouldCaptureBrowserFailure({}, true)).toBe(true);
    expect(shouldCaptureBrowserFailure({ captureFailures: false }, true)).toBe(false);
    expect(shouldCaptureBrowserFailure({ captureFailures: true }, true)).toBe(true);
  });

  it("saves browser state only for session flows unless explicitly overridden", () => {
    expect(shouldSaveBrowserState({})).toBe(false);
    expect(shouldSaveBrowserState({ requireSession: false })).toBe(false);
    expect(shouldSaveBrowserState({ requireSession: true })).toBe(true);
    expect(shouldSaveBrowserState({ requireSession: false, saveState: true })).toBe(true);
    expect(shouldSaveBrowserState({ requireSession: true, saveState: false })).toBe(false);
  });

  it("lets live-status own expired-session demotion instead of throwing first", () => {
    expect(shouldCheckExpiredSession({})).toBe(false);
    expect(shouldCheckExpiredSession({ requireSession: true })).toBe(true);
    expect(shouldCheckExpiredSession({ requireSession: true, checkExpiredSession: false })).toBe(false);
    expect(shouldCheckExpiredSession({ requireSession: false, checkExpiredSession: false })).toBe(false);
  });

  it("always closes launched browser contexts after setup or task completion", async () => {
    const context = {
      closed: false,
      async close() {
        this.closed = true;
      }
    };

    await expect(withClosingBrowserContext(context, async () => "ok")).resolves.toBe("ok");
    expect(context.closed).toBe(true);
  });

  it("closes launched browser contexts when setup or task work fails", async () => {
    const context = {
      closed: false,
      async close() {
        this.closed = true;
      }
    };

    await expect(
      withClosingBrowserContext(context, async () => {
        throw new Error("new page failed");
      })
    ).rejects.toThrow("new page failed");
    expect(context.closed).toBe(true);
  });

  it("does not mask the command result when browser context close fails", async () => {
    const context = {
      async close() {
        throw new Error("close failed");
      }
    };

    await expect(withClosingBrowserContext(context, async () => "ok")).resolves.toBe("ok");
  });

  it("does not hang command completion when browser context close never settles", async () => {
    let closeStarted = false;
    const context = {
      async close() {
        closeStarted = true;
        await new Promise(() => undefined);
      }
    };

    await expect(withClosingBrowserContext(context, async () => "ok", 1)).resolves.toBe("ok");
    expect(closeStarted).toBe(true);
  });

  it("treats missing browser context cleanup as a no-op", async () => {
    await expect(closeBrowserContextBestEffort(undefined, 1)).resolves.toBeUndefined();
  });

  it("clears the browser close timeout after successful close", async () => {
    vi.useFakeTimers();
    const browser = {
      close: vi.fn().mockResolvedValue(undefined)
    };
    const context = {
      close: vi.fn().mockResolvedValue(undefined),
      browser: () => browser
    };

    await closeBrowserContextBestEffort(context, 5_000);

    expect(context.close).toHaveBeenCalledOnce();
    expect(browser.close).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("force closes the owning browser when context close times out", async () => {
    vi.useFakeTimers();
    const browser = {
      close: vi.fn().mockResolvedValue(undefined)
    };
    const context = {
      close: vi.fn(async () => {
        await new Promise(() => undefined);
      }),
      browser: () => browser
    };

    const cleanup = closeBrowserContextBestEffort(context, 5_000);
    await vi.advanceTimersByTimeAsync(5_000);
    await cleanup;

    expect(context.close).toHaveBeenCalledOnce();
    expect(browser.close).toHaveBeenCalledWith({
      reason: "ZepoCli browser context cleanup timed out."
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("force closes the owning browser when context close rejects", async () => {
    const browser = {
      close: vi.fn().mockResolvedValue(undefined)
    };
    const context = {
      close: vi.fn().mockRejectedValue(new Error("close failed")),
      browser: () => browser
    };

    await closeBrowserContextBestEffort(context, 5_000);

    expect(context.close).toHaveBeenCalledOnce();
    expect(browser.close).toHaveBeenCalledWith({
      reason: "ZepoCli browser context cleanup failed."
    });
  });

  it("launches Chromium without a stale user-agent override", () => {
    const options = buildPersistentContextOptions(true);

    expect(options).toMatchObject({
      headless: true,
      locale: "en-IN",
      timezoneId: "Asia/Kolkata",
      viewport: {
        width: 1366,
        height: 900
      }
    });
    expect(options).not.toHaveProperty("userAgent");
  });

  it("paces repeated browser automation runs", () => {
    expect(computeBrowserPacingDelay(undefined, 10_000)).toBe(0);
    expect(computeBrowserPacingDelay("not-a-timestamp", 10_000)).toBe(0);
    expect(computeBrowserPacingDelay("9000", 10_000)).toBe(2_000);
    expect(computeBrowserPacingDelay("7000", 10_000)).toBe(0);
    expect(computeBrowserPacingDelay("11000", 10_000)).toBe(3_000);
  });

  it("allows manual access challenge resolution only for interactive visible runs", () => {
    expect(shouldAllowManualAccessChallengeResolution(false, true)).toBe(true);
    expect(shouldAllowManualAccessChallengeResolution(false, false)).toBe(false);
    expect(shouldAllowManualAccessChallengeResolution(true, true)).toBe(false);
    expect(computeManualAccessChallengeWaitMs(30_000)).toBe(90_000);
    expect(computeManualAccessChallengeWaitMs(120_000)).toBe(120_000);

    const page = {} as Parameters<typeof configurePageAccessChallengeHandling>[0];
    configurePageAccessChallengeHandling(page, { allowManualResolution: true, waitMs: 90_000 });
    expect(pageHadAccessChallenge(page)).toBe(false);
    clearPageAccessChallengeHandling(page);
    expect(pageHadAccessChallenge(page)).toBe(false);
  });

  it("pauses headless automation after a recent access challenge", () => {
    expect(computeAccessChallengeCooldownDelay(undefined, 10_000)).toBe(0);
    expect(computeAccessChallengeCooldownDelay("not-a-timestamp", 10_000)).toBe(0);
    expect(computeAccessChallengeCooldownDelay("9000", 10_000)).toBe(899_000);
    expect(computeAccessChallengeCooldownDelay("0", 910_000)).toBe(0);
    expect(computeAccessChallengeCooldownDelay("11000", 10_000)).toBe(900_000);

    expect(() => assertNoAccessChallengeCooldown("9000", 10_000)).toThrow(
      "Recent Zepto verification or block was detected"
    );
    try {
      assertNoAccessChallengeCooldown("9000", 10_000);
    } catch (error) {
      expect(error).toBeInstanceOf(UserFacingError);
      expect((error as UserFacingError).code).toBe("zepto_access_cooldown");
      expect((error as UserFacingError).retryAfterMs).toBe(899_000);
    }
    expect(() => assertNoAccessChallengeCooldown("0", 910_000)).not.toThrow();
    expect(getAccessChallengeCooldownStatus("9000", 10_000)).toEqual({
      detected: true,
      lastDetectedAt: "1970-01-01T00:00:09.000Z",
      cooldownActive: true,
      retryAfterMs: 899_000
    });
    expect(getAccessChallengeCooldownStatus("0", 910_000)).toEqual({
      detected: true,
      lastDetectedAt: "1970-01-01T00:00:00.000Z",
      cooldownActive: false,
      retryAfterMs: 0
    });
    expect(getAccessChallengeCooldownStatus("not-a-timestamp", 10_000)).toEqual({
      detected: false,
      cooldownActive: false,
      retryAfterMs: 0
    });
  });

  it("throttles rapid headless browser automation bursts", () => {
    let history: string | undefined;
    for (let index = 0; index < 8; index += 1) {
      history = recordHeadlessBrowserRun(history, 10_000 + index);
    }

    expect(getHeadlessBrowserThrottleStatus(history, 10_100)).toEqual({
      windowMs: 600_000,
      limit: 8,
      recentRuns: 8,
      throttleActive: true,
      retryAfterMs: 599_900
    });
    expect(() => assertHeadlessBrowserRunBudget(history, 10_100)).toThrow(
      "Headless browser automation is cooling down after many recent Zepto commands."
    );
    try {
      assertHeadlessBrowserRunBudget(history, 10_100);
    } catch (error) {
      expect(error).toBeInstanceOf(UserFacingError);
      expect((error as UserFacingError).code).toBe("headless_browser_throttle");
      expect((error as UserFacingError).retryAfterMs).toBe(599_900);
    }
    expect(getHeadlessBrowserThrottleStatus(history, 610_000)).toMatchObject({
      recentRuns: 7,
      throttleActive: false,
      retryAfterMs: 0
    });
    expect(getHeadlessBrowserThrottleStatus("not-json", 10_100)).toMatchObject({
      recentRuns: 0,
      throttleActive: false
    });
  });

  it("summarizes safe browser automation readiness for agents", () => {
    const ready = getBrowserAutomationReadiness({
      browserLock: {
        path: "browser.lock",
        present: false,
        stale: false
      },
      headlessBrowserThrottle: {
        windowMs: 600_000,
        limit: 8,
        recentRuns: 0,
        throttleActive: false,
        retryAfterMs: 0
      },
      accessChallenge: {
        detected: false,
        cooldownActive: false,
        retryAfterMs: 0
      }
    });

    expect(ready).toEqual({
      ready: true,
      reasons: [],
      retryAfterMs: 0
    });

    const blocked = getBrowserAutomationReadiness({
      browserLock: {
        path: "browser.lock",
        present: true,
        stale: false
      },
      headlessBrowserThrottle: {
        windowMs: 600_000,
        limit: 8,
        recentRuns: 8,
        throttleActive: true,
        retryAfterMs: 100_000
      },
      accessChallenge: {
        detected: true,
        lastDetectedAt: "1970-01-01T00:00:00.000Z",
        cooldownActive: true,
        retryAfterMs: 200_000
      }
    });

    expect(blocked).toMatchObject({
      ready: false,
      reasons: ["browser_lock_active", "headless_browser_throttle", "zepto_access_cooldown"],
      retryAfterMs: 200_000
    });
    expect(blocked.hint).toContain("wait for the active browser command");
    expect(blocked.hint).toContain("wait 4 minutes");
    expect(blocked.hint).toContain("--visible");
    expect(blocked.hint).toContain("Do not loop headless Zepto commands");
  });

  it("detects Zepto access challenge text without treating normal OTP copy as a block", () => {
    expect(isAccessChallengeText("Access denied. Too many requests from this browser.")).toBe(true);
    expect(isAccessChallengeText("Please verify you are human before continuing")).toBe(true);
    expect(isAccessChallengeText("Sorry, you have been blocked")).toBe(true);
    expect(isAccessChallengeText("Checking if the site connection is secure")).toBe(true);
    expect(isAccessChallengeText("Cloudflare Ray ID. Complete the security check to continue.")).toBe(true);
    expect(isAccessChallengeText("HTTP ERROR 429. Too many attempts.")).toBe(true);
    expect(isAccessChallengeText("403 Forbidden. Request forbidden.")).toBe(true);
    expect(isAccessChallengeText("Just a moment... enable JavaScript and cookies to continue.")).toBe(true);
    expect(isAccessChallengeText("Your access is temporarily restricted.")).toBe(true);
    expect(isAccessChallengeText("Enter OTP sent to your mobile number")).toBe(false);
    expect(isAccessChallengeText("Search for milk Cart Account")).toBe(false);
    expect(isAccessChallengeText("A product costs ₹429 and can be added to cart")).toBe(false);
  });

  it("treats HTTP 403 and 429 navigation responses as access protection", () => {
    expect(() => assertNoAccessChallengeResponse(undefined)).not.toThrow();
    expect(() => assertNoAccessChallengeResponse(createNavigationResponse(200))).not.toThrow();
    expect(() => assertNoAccessChallengeResponse(createNavigationResponse(302))).not.toThrow();

    expect(() => assertNoAccessChallengeResponse(createNavigationResponse(403))).toThrow(
      "Zepto is asking for verification or blocking automated access."
    );
    try {
      assertNoAccessChallengeResponse(createNavigationResponse(403));
    } catch (error) {
      expect(error).toBeInstanceOf(UserFacingError);
      expect((error as UserFacingError).code).toBe("zepto_access_challenge");
      expect((error as UserFacingError).retryAfterMs).toBe(ACCESS_CHALLENGE_COOLDOWN_MS);
    }
    expect(() => assertNoAccessChallengeResponse(createNavigationResponse(429))).toThrow(
      "Zepto is asking for verification or blocking automated access."
    );
  });

  it("detects blocked Zepto document and API responses before the page text changes", async () => {
    const page = createResponseAwarePage();
    configurePageAccessChallengeHandling(page as never, { allowManualResolution: false, waitMs: 90_000 });

    page.responseListener?.(createResponse(429, "fetch", "https://www.zepto.com/api/search?query=milk"));

    expect(pageHadAccessChallenge(page as never)).toBe(true);
    await expect(assertNoAccessChallenge(page as never)).rejects.toThrow(
      "Zepto is asking for verification or blocking automated access."
    );

    clearPageAccessChallengeHandling(page as never);
    expect(page.offCalled).toBe(true);
  });

  it("detects blocked legacy zeptonow.com responses as Zepto access challenges", async () => {
    const page = createResponseAwarePage();
    configurePageAccessChallengeHandling(page as never, { allowManualResolution: false, waitMs: 90_000 });

    page.responseListener?.(createResponse(429, "fetch", "https://www.zeptonow.com/api/search?query=milk"));

    expect(pageHadAccessChallenge(page as never)).toBe(true);
    await expect(assertNoAccessChallenge(page as never)).rejects.toThrow(
      "Zepto is asking for verification or blocking automated access."
    );

    clearPageAccessChallengeHandling(page as never);
  });

  it("lets visible interactive runs continue after Zepto-controlled verification is resolved", async () => {
    const page = createResponseAwarePage();
    configurePageAccessChallengeHandling(page as never, { allowManualResolution: true, waitMs: 90_000 });

    page.responseListener?.(createResponse(429, "document", "https://www.zepto.com/security-check"));

    expect(pageHadAccessChallenge(page as never)).toBe(true);
    await expect(assertNoAccessChallenge(page as never)).resolves.toBeUndefined();

    clearPageAccessChallengeHandling(page as never);
  });

  it("does not treat blocked non-Zepto or static asset responses as Zepto access challenges", async () => {
    const page = createResponseAwarePage();
    configurePageAccessChallengeHandling(page as never, { allowManualResolution: false, waitMs: 90_000 });

    page.responseListener?.(createResponse(429, "fetch", "https://example.com/api/search"));
    page.responseListener?.(createResponse(429, "image", "https://www.zepto.com/image.png"));

    expect(pageHadAccessChallenge(page as never)).toBe(false);
    await expect(assertNoAccessChallenge(page as never)).resolves.toBeUndefined();

    clearPageAccessChallengeHandling(page as never);
  });

  function createNavigationResponse(status: number) {
    return {
      status: () => status
    };
  }

  function createResponseAwarePage() {
    return {
      responseListener: undefined as ((response: ReturnType<typeof createResponse>) => void) | undefined,
      offCalled: false,
      on(event: string, listener: (response: ReturnType<typeof createResponse>) => void) {
        if (event === "response") {
          this.responseListener = listener;
        }
      },
      off(event: string, listener: (response: ReturnType<typeof createResponse>) => void) {
        if (event === "response" && this.responseListener === listener) {
          this.offCalled = true;
          this.responseListener = undefined;
        }
      },
      title: async () => "Zepto",
      waitForFunction: async () => undefined,
      waitForLoadState: async () => undefined,
      locator: () => ({
        innerText: async () => "Search for milk"
      })
    };
  }

  function createResponse(status: number, resourceType: string, url: string) {
    return {
      status: () => status,
      url: () => url,
      request: () => ({
        resourceType: () => resourceType
      })
    };
  }

  function createLoginStatePage(options: { bodyText: string; phoneInputVisible: boolean }) {
    const phoneInput = {
      first() {
        return this;
      },
      isVisible: async () => options.phoneInputVisible
    };

    return {
      locator: (selector: string) => {
        if (selector === "body") {
          return {
            innerText: async () => options.bodyText
          };
        }

        if (selector.includes("input[type='tel']")) {
          return phoneInput;
        }

        return {
          first() {
            return this;
          },
          isVisible: async () => false
        };
      }
    };
  }

  it("detects login-required Zepto pages without treating account navigation as expired auth", () => {
    expect(isLoginRequiredText("Enter mobile number to continue")).toBe(true);
    expect(isLoginRequiredText("Verify OTP sent to your phone number")).toBe(true);
    expect(isLoginRequiredText("Verify mobile number to continue")).toBe(true);
    expect(isLoginRequiredText("Login to continue Checkout")).toBe(true);
    expect(isLoginRequiredText("Log in to view your cart")).toBe(true);
    expect(isLoginRequiredText("Login / Sign Up Continue with phone")).toBe(true);
    expect(isLoginRequiredText("Login Cart Your cart is empty")).toBe(true);
    expect(isLoginRequiredText("Search for milk Cart Account Profile")).toBe(false);
    expect(isLoginRequiredText("Account My Orders Wallet")).toBe(false);
  });

  it("does not treat logged-in account pages with phone fields as expired auth", async () => {
    const page = createLoginStatePage({
      bodyText: "Account My Orders Wallet Profile",
      phoneInputVisible: true
    });

    await expect(isLoginRequiredPage(page as never)).resolves.toBe(false);
  });

  it("uses visible phone or numeric inputs as expired-auth evidence only when page text is ambiguous", async () => {
    const page = createLoginStatePage({
      bodyText: "Zepto",
      phoneInputVisible: true
    });

    await expect(isLoginRequiredPage(page as never)).resolves.toBe(true);
  });

  it("treats login prompts as expired auth even when account words are present", async () => {
    const page = createLoginStatePage({
      bodyText: "Account Wallet Verify OTP",
      phoneInputVisible: false
    });

    await expect(isLoginRequiredPage(page as never)).resolves.toBe(true);
  });

  it("identifies access challenge errors distinctly from other user errors", () => {
    expect(
      isAccessChallengeError(
        new UserFacingError("Message text can change.", {
          code: "zepto_access_challenge"
        })
      )
    ).toBe(true);
    expect(
      isAccessChallengeError(
        new UserFacingError("No confirmed Zepto session found.", {
          code: "no_confirmed_session"
        })
      )
    ).toBe(false);
    expect(isAccessChallengeError(new Error("Zepto is asking for verification or blocking automated access."))).toBe(false);
    expect(
      isAccessChallengeError(
        new UserFacingError("Zepto is asking for verification or blocking automated access.", {
          code: "runtime_setup_failed"
        })
      )
    ).toBe(false);
    expect(
      isAccessProtectionError(
        new UserFacingError("Message text can change.", {
          code: "zepto_access_protection"
        })
      )
    ).toBe(true);
    expect(isAccessProtectionError(new Error("Zepto returned an empty page during search."))).toBe(false);
  });

  it("serializes browser automation with a lock file", () => {
    tempDir = mkdtempSync(join(tmpdir(), "zepo-browser-lock-"));
    const lockPath = join(tempDir, "browser.lock");

    const release = acquireBrowserRunLock(lockPath, 10_000);

    expect(existsSync(lockPath)).toBe(true);
    expect(getBrowserRunLockStatus(lockPath, 10_100)).toEqual({
      path: lockPath,
      present: true,
      stale: false,
      pid: process.pid,
      createdAt: new Date(10_000).toISOString()
    });
    const lock = JSON.parse(readFileSync(lockPath, "utf8")) as { pid: number; createdAt: number; token: string };
    expect(lock.pid).toBe(process.pid);
    expect(lock.createdAt).toBe(10_000);
    expect(lock.token).toBeTypeOf("string");
    expect(() => acquireBrowserRunLock(lockPath, 10_100)).toThrow(
      "Another ZepoCli browser command is already running for this data directory."
    );
    try {
      acquireBrowserRunLock(lockPath, 10_100);
    } catch (error) {
      expect(error).toBeInstanceOf(UserFacingError);
      expect((error as UserFacingError).code).toBe("browser_lock_active");
    }

    release();
    expect(existsSync(lockPath)).toBe(false);
    expect(getBrowserRunLockStatus(lockPath, 10_200)).toEqual({
      path: lockPath,
      present: false,
      stale: false
    });
  });

  it("recovers stale browser automation locks", () => {
    tempDir = mkdtempSync(join(tmpdir(), "zepo-browser-stale-lock-"));
    const lockPath = join(tempDir, "browser.lock");
    writeFileSync(
      lockPath,
      JSON.stringify({
        token: "old",
        pid: process.pid,
        createdAt: 10_000
      })
    );

    expect(isStaleBrowserRunLock(lockPath, 20 * 60 * 1_000)).toBe(true);
    expect(getBrowserRunLockStatus(lockPath, 20 * 60 * 1_000)).toEqual({
      path: lockPath,
      present: true,
      stale: true,
      pid: process.pid,
      createdAt: new Date(10_000).toISOString(),
      staleReason: "expired"
    });
    const release = acquireBrowserRunLock(lockPath, 20 * 60 * 1_000);

    const lock = JSON.parse(readFileSync(lockPath, "utf8")) as { token: string; createdAt: number };
    expect(lock.token).not.toBe("old");
    expect(lock.createdAt).toBe(20 * 60 * 1_000);

    release();
    expect(existsSync(lockPath)).toBe(false);
  });

  it("recovers browser automation locks whose owner process has exited", () => {
    tempDir = mkdtempSync(join(tmpdir(), "zepo-browser-dead-lock-"));
    const lockPath = join(tempDir, "browser.lock");
    writeFileSync(
      lockPath,
      JSON.stringify({
        token: "dead",
        pid: 99_999_999,
        createdAt: 10_000
      })
    );

    expect(isStaleBrowserRunLock(lockPath, 11_000)).toBe(true);
    expect(getBrowserRunLockStatus(lockPath, 11_000)).toEqual({
      path: lockPath,
      present: true,
      stale: true,
      pid: 99_999_999,
      createdAt: new Date(10_000).toISOString(),
      staleReason: "process_not_running"
    });

    const release = acquireBrowserRunLock(lockPath, 11_000);
    const lock = JSON.parse(readFileSync(lockPath, "utf8")) as { token: string; pid: number; createdAt: number };
    expect(lock.token).not.toBe("dead");
    expect(lock.pid).toBe(process.pid);
    expect(lock.createdAt).toBe(11_000);

    release();
    expect(existsSync(lockPath)).toBe(false);
  });

  it("runs browser cleanup before exiting on termination signals", async () => {
    const signalProcess = createSignalProcess();
    const cleanupCalls: string[] = [];
    const exitCodes: number[] = [];
    const dispose = installProcessSignalCleanup(
      async () => {
        cleanupCalls.push("cleanup");
      },
      signalProcess.process,
      (code) => {
        exitCodes.push(code);
      }
    );

    expect(signalProcess.listenerCount()).toBe(2);

    await signalProcess.emit("SIGINT");

    expect(cleanupCalls).toEqual(["cleanup"]);
    expect(exitCodes).toEqual([130]);
    expect(signalProcess.listenerCount()).toBe(0);

    dispose();
    expect(signalProcess.listenerCount()).toBe(0);
  });

  it("removes signal cleanup handlers after normal browser completion", () => {
    const signalProcess = createSignalProcess();
    const dispose = installProcessSignalCleanup(() => undefined, signalProcess.process, () => undefined);

    expect(signalProcess.listenerCount()).toBe(2);

    dispose();

    expect(signalProcess.listenerCount()).toBe(0);
  });
});

function createSignalProcess() {
  const listeners = new Map<NodeJS.Signals, (signal: NodeJS.Signals) => void | Promise<void>>();
  const process = {
    once(signal: NodeJS.Signals, listener: (signal: NodeJS.Signals) => void | Promise<void>) {
      listeners.set(signal, listener);
      return this;
    },
    off(signal: NodeJS.Signals, listener: (signal: NodeJS.Signals) => void | Promise<void>) {
      if (listeners.get(signal) === listener) {
        listeners.delete(signal);
      }
      return this;
    }
  };

  return {
    process,
    listenerCount: () => listeners.size,
    emit: async (signal: NodeJS.Signals) => {
      const listener = listeners.get(signal);
      listeners.delete(signal);
      await listener?.(signal);
    }
  };
}
