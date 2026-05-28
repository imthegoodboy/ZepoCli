import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { chromium, type Browser, type BrowserContext, type Page, type Response } from "playwright";

import { BASE_URL } from "../config/constants.js";
import type { AppRuntime } from "../config/runtime.js";
import type {
  AccessChallengeStatus,
  BrowserAutomationReadiness,
  BrowserAutomationReadinessReason,
  BrowserRunLockStatus,
  BrowserRunThrottleStatus,
  SessionStatus
} from "../types.js";
import { UserFacingError } from "../utils/errors.js";

const BROWSER_RUN_PACING_MS = 3_000;
const BROWSER_RUN_LOCK_STALE_MS = 15 * 60 * 1_000;
const BROWSER_CONTEXT_CLOSE_TIMEOUT_MS = 5_000;
const HEADLESS_BROWSER_BURST_WINDOW_MS = 10 * 60 * 1_000;
const HEADLESS_BROWSER_BURST_LIMIT = 8;
export const ACCESS_CHALLENGE_COOLDOWN_MS = 15 * 60 * 1_000;
const VISIBLE_ACCESS_CHALLENGE_WAIT_MS = 90_000;
const LAST_BROWSER_RUN_META_KEY = "last_browser_run_at";
export const HEADLESS_BROWSER_RUN_HISTORY_META_KEY = "headless_browser_run_history";
export const LAST_ACCESS_CHALLENGE_META_KEY = "last_access_challenge_at";
const ACCESS_CHALLENGE_MESSAGE = "Zepto is asking for verification or blocking automated access.";
const ACCESS_CHALLENGE_TEXT_PATTERN =
  /\b(captcha|cloudflare|security check|verify you are human|are you human|unusual traffic|automated traffic|access denied|access forbidden|request blocked|request forbidden|too many requests|too many attempts|rate limit|temporarily blocked|temporarily restricted|you have been blocked|checking if the site connection is secure|checking your browser|just a moment|enable javascript and cookies)\b|(?:\b(?:http|error|status)\s*(?:403|429)\b)|(?:\b(?:403|429)\s*(?:forbidden|too many requests)\b)/i;
const LOGIN_REQUIRED_TEXT_PATTERN =
  /\b(enter mobile|mobile number|phone number|otp|verify otp|verify mobile|sign in|login to continue|log in to continue|login to view|log in to view|login\s*\/\s*sign\s*up|login\/sign up|continue with phone|continue with mobile)\b/i;
const PROCESS_CLEANUP_SIGNALS = ["SIGINT", "SIGTERM"] as const;
const SIGNAL_EXIT_CODES: Record<(typeof PROCESS_CLEANUP_SIGNALS)[number], number> = {
  SIGINT: 130,
  SIGTERM: 143
};

interface PageSafetyState {
  allowManualAccessChallengeResolution: boolean;
  accessChallengeDetected: boolean;
  accessChallengeResponse?: AccessChallengeResponseSignal;
  manualAccessChallengeWaitMs: number;
  responseListener?: (response: Response) => void;
}

interface AccessChallengeResponseSignal {
  status: number;
  url: string;
}

const pageSafetyStates = new WeakMap<Page, PageSafetyState>();

export interface BrowserRunOptions {
  checkExpiredSession?: boolean;
  captureFailures?: boolean;
  headless?: boolean;
  requireSession?: boolean;
  saveState?: boolean;
}

export class BrowserAutomation {
  constructor(private readonly runtime: AppRuntime) {}

  async withPage<T>(
    options: BrowserRunOptions,
    task: (page: Page, context: BrowserContext) => Promise<T>
  ): Promise<T> {
    if (options.requireSession && !this.runtime.session.hasConfirmedSession()) {
      const status = this.runtime.session.status();
      throw new UserFacingError("No confirmed Zepto session found.", {
        code: "no_confirmed_session",
        hint: confirmedSessionHint(status)
      });
    }

    const headless = options.headless ?? this.runtime.options.headless;
    if (headless) {
      assertNoAccessChallengeCooldown(this.runtime.sqlite.getMeta(LAST_ACCESS_CHALLENGE_META_KEY));
      assertHeadlessBrowserRunBudget(this.runtime.sqlite.getMeta(HEADLESS_BROWSER_RUN_HISTORY_META_KEY));
    }

    const releaseLock = acquireBrowserRunLock(this.runtime.paths.browserLockPath);
    let lockReleased = false;
    let context: BrowserContext | undefined;
    const releaseBrowserResources = async () => {
      await closeBrowserContextBestEffort(context);
      context = undefined;
      if (!lockReleased) {
        releaseLock();
        lockReleased = true;
      }
    };
    const disposeSignalCleanup = installProcessSignalCleanup(releaseBrowserResources);
    try {
      await this.paceBrowserRun();

      try {
        context = await chromium.launchPersistentContext(
          this.runtime.session.browserProfileDir,
          buildPersistentContextOptions(headless)
        );
      } catch (error) {
        this.runtime.logger.error(
          {
            error: error instanceof Error ? error.message : String(error),
            browserProfileDir: this.runtime.session.browserProfileDir
          },
          "browser launch failed"
        );
        throw toBrowserLaunchError(error);
      }

      const browserContext = context;
      browserContext.setDefaultTimeout(this.runtime.options.timeoutMs);
      browserContext.setDefaultNavigationTimeout(this.runtime.options.timeoutMs);

      const page = await browserContext.newPage();
      try {
        configurePageAccessChallengeHandling(page, {
          allowManualResolution: shouldAllowManualAccessChallengeResolution(headless, this.runtime.options.interactive),
          waitMs: computeManualAccessChallengeWaitMs(this.runtime.options.timeoutMs)
        });
        if (headless) {
          this.runtime.sqlite.setMeta(
            HEADLESS_BROWSER_RUN_HISTORY_META_KEY,
            recordHeadlessBrowserRun(this.runtime.sqlite.getMeta(HEADLESS_BROWSER_RUN_HISTORY_META_KEY))
          );
        }

        try {
          const result = await task(page, browserContext);
          await assertNoAccessChallenge(page);
          if (shouldCheckExpiredSession(options) && (await isLoginRequiredPage(page))) {
            this.runtime.session.markLoggedOut();
            throw expiredSessionError();
          }
          if (shouldSaveBrowserState(options)) {
            await browserContext.storageState({ path: this.runtime.session.storageStatePath });
          }
          if (pageHadAccessChallenge(page)) {
            this.runtime.sqlite.setMeta(LAST_ACCESS_CHALLENGE_META_KEY, String(Date.now()));
          }
          return result;
        } catch (error) {
          const expiredSessionError = isAccessChallengeError(error)
            ? undefined
            : await this.demoteExpiredSessionIfLoginRequired(page, shouldCheckExpiredSession(options)).catch(() => undefined);
          const finalError = expiredSessionError ?? error;

          if (isAccessProtectionError(finalError) || pageHadAccessChallenge(page)) {
            this.runtime.sqlite.setMeta(LAST_ACCESS_CHALLENGE_META_KEY, String(Date.now()));
          }
          if (!expiredSessionError && shouldCaptureBrowserFailure(options, this.runtime.options.debug)) {
            await this.captureFailure(page, finalError).catch(() => undefined);
          }
          throw finalError;
        }
      } finally {
        clearPageAccessChallengeHandling(page);
      }
    } finally {
      try {
        await releaseBrowserResources();
      } finally {
        disposeSignalCleanup();
      }
    }
  }

  private async captureFailure(page: Page, error: unknown): Promise<void> {
    mkdirSync(this.runtime.paths.diagnosticsDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const screenshotPath = join(this.runtime.paths.diagnosticsDir, `${stamp}.png`);
    const htmlPath = join(this.runtime.paths.diagnosticsDir, `${stamp}.html`);
    const url = page.url();

    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
    writeFileSync(htmlPath, await page.content());

    this.runtime.logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        url,
        screenshotPath,
        htmlPath
      },
      "browser automation failed"
    );
  }

  private async paceBrowserRun(): Promise<void> {
    const waitMs = computeBrowserPacingDelay(this.runtime.sqlite.getMeta(LAST_BROWSER_RUN_META_KEY));
    if (waitMs > 0) {
      await sleep(waitMs);
    }

    this.runtime.sqlite.setMeta(LAST_BROWSER_RUN_META_KEY, String(Date.now()));
  }

  private async demoteExpiredSessionIfLoginRequired(
    page: Page,
    requireSession: boolean | undefined
  ): Promise<UserFacingError | undefined> {
    if (!requireSession || !(await isLoginRequiredPage(page))) {
      return undefined;
    }

    this.runtime.session.markLoggedOut();
    return expiredSessionError();
  }
}

export function acquireBrowserRunLock(lockPath: string, nowMs = Date.now()): () => void {
  const token = randomUUID();

  const create = () => {
    const fd = openSync(lockPath, "wx");
    try {
      writeFileSync(
        fd,
        JSON.stringify(
          {
            token,
            pid: process.pid,
            createdAt: nowMs
          },
          null,
          2
        )
      );
    } finally {
      closeSync(fd);
    }

    return () => releaseBrowserRunLock(lockPath, token);
  };

  try {
    return create();
  } catch (error) {
    if (!isFileExistsError(error)) {
      throw toBrowserLockCreateError(error);
    }
  }

  if (isStaleBrowserRunLock(lockPath, nowMs)) {
    rmSync(lockPath, { force: true });
    try {
      return create();
    } catch (error) {
      if (!isFileExistsError(error)) {
        throw toBrowserLockCreateError(error);
      }
    }
  }

  throw new UserFacingError("Another ZepoCli browser command is already running for this data directory.", {
    code: "browser_lock_active",
    hint:
      "Wait for the other command to finish, or use a separate `--data-dir` for independent sessions. If no command is running, remove the stale browser lock after checking the data directory."
  });
}

export function isStaleBrowserRunLock(lockPath: string, nowMs = Date.now()): boolean {
  return browserRunLockStaleReason(lockPath, nowMs) !== undefined;
}

export function getBrowserRunLockStatus(lockPath: string, nowMs = Date.now()): BrowserRunLockStatus {
  const present = existsSync(lockPath);
  if (!present) {
    return {
      path: lockPath,
      present,
      stale: false
    };
  }

  const details = readBrowserRunLockDetails(lockPath);
  const staleReason = browserRunLockStaleReason(lockPath, nowMs, details);
  return {
    path: lockPath,
    present,
    stale: staleReason !== undefined,
    ...(details.pid !== undefined ? { pid: details.pid } : {}),
    ...(details.createdAt !== undefined ? { createdAt: new Date(details.createdAt).toISOString() } : {}),
    ...(staleReason ? { staleReason } : {})
  };
}

export function getBrowserAutomationReadiness(input: {
  browserLock: BrowserRunLockStatus;
  headlessBrowserThrottle: BrowserRunThrottleStatus;
  accessChallenge: AccessChallengeStatus;
}): BrowserAutomationReadiness {
  const reasons: BrowserAutomationReadinessReason[] = [];
  if (input.browserLock.present && !input.browserLock.stale) {
    reasons.push("browser_lock_active");
  }
  if (input.headlessBrowserThrottle.throttleActive) {
    reasons.push("headless_browser_throttle");
  }
  if (input.accessChallenge.cooldownActive) {
    reasons.push("zepto_access_cooldown");
  }

  const retryAfterMs = Math.max(input.headlessBrowserThrottle.retryAfterMs, input.accessChallenge.retryAfterMs, 0);
  if (reasons.length === 0) {
    return {
      ready: true,
      reasons,
      retryAfterMs: 0
    };
  }

  return {
    ready: false,
    reasons,
    retryAfterMs,
    hint: browserAutomationReadinessHint(reasons, retryAfterMs)
  };
}

export function buildPersistentContextOptions(
  headless: boolean
): NonNullable<Parameters<typeof chromium.launchPersistentContext>[1]> {
  return {
    headless,
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
    viewport: {
      width: 1366,
      height: 900
    }
  };
}

export async function withClosingBrowserContext<T>(
  context: ClosableBrowserContext,
  task: () => Promise<T>,
  closeTimeoutMs = BROWSER_CONTEXT_CLOSE_TIMEOUT_MS
): Promise<T> {
  try {
    return await task();
  } finally {
    await closeBrowserContextBestEffort(context, closeTimeoutMs);
  }
}

export async function closeBrowserContextBestEffort(
  context: ClosableBrowserContext | undefined,
  timeoutMs = BROWSER_CONTEXT_CLOSE_TIMEOUT_MS
): Promise<void> {
  if (!context) {
    return;
  }

  try {
    const contextClose = await waitForSettlementOrTimeout(context.close(), timeoutMs);
    if (contextClose === "settled") {
      return;
    }

    const browser = context.browser?.();
    if (browser) {
      await waitForSettlementOrTimeout(
        browser.close({ reason: "ZepoCli browser context cleanup timed out." }),
        timeoutMs
      );
    }
  } catch {
    // Best-effort cleanup must not replace the command's real result.
  }
}

interface ClosableBrowserContext {
  close(): Promise<void>;
  browser?: () => Pick<Browser, "close"> | null;
}

function waitForSettlementOrTimeout(promise: Promise<unknown>, timeoutMs: number): Promise<"settled" | "timed-out"> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("timed-out"), timeoutMs);
    promise.then(
      () => {
        clearTimeout(timer);
        resolve("settled");
      },
      () => {
        clearTimeout(timer);
        resolve("settled");
      }
    );
  });
}

interface SignalProcess {
  once(signal: NodeJS.Signals, listener: (signal: NodeJS.Signals) => void | Promise<void>): unknown;
  off(signal: NodeJS.Signals, listener: (signal: NodeJS.Signals) => void | Promise<void>): unknown;
}

export function installProcessSignalCleanup(
  cleanup: () => void | Promise<void>,
  processLike: SignalProcess = process,
  exit: (code: number) => void = (code) => {
    process.exit(code);
  }
): () => void {
  let disposed = false;
  let cleaningUp = false;
  const handler = async (signal: NodeJS.Signals) => {
    if (cleaningUp) {
      return;
    }

    cleaningUp = true;
    try {
      await cleanup();
    } finally {
      dispose();
      exit(signalExitCode(signal));
    }
  };

  const dispose = () => {
    if (disposed) {
      return;
    }

    disposed = true;
    for (const signal of PROCESS_CLEANUP_SIGNALS) {
      processLike.off(signal, handler);
    }
  };

  for (const signal of PROCESS_CLEANUP_SIGNALS) {
    processLike.once(signal, handler);
  }

  return dispose;
}

function signalExitCode(signal: NodeJS.Signals): number {
  return signal === "SIGTERM" ? SIGNAL_EXIT_CODES.SIGTERM : SIGNAL_EXIT_CODES.SIGINT;
}

export function shouldAllowManualAccessChallengeResolution(headless: boolean, interactive: boolean): boolean {
  return !headless && interactive;
}

export function computeManualAccessChallengeWaitMs(timeoutMs: number): number {
  return Math.max(VISIBLE_ACCESS_CHALLENGE_WAIT_MS, timeoutMs);
}

export function configurePageAccessChallengeHandling(
  page: Page,
  options: { allowManualResolution: boolean; waitMs: number }
): void {
  const state: PageSafetyState = {
    allowManualAccessChallengeResolution: options.allowManualResolution,
    accessChallengeDetected: false,
    manualAccessChallengeWaitMs: options.waitMs
  };
  state.responseListener = (response) => {
    const signal = blockedZeptoResponseSignal(response);
    if (!signal) {
      return;
    }

    state.accessChallengeDetected = true;
    state.accessChallengeResponse = signal;
  };

  pageSafetyStates.set(page, state);
  const eventPage = page as { on?: (event: "response", listener: (response: Response) => void) => void };
  eventPage.on?.("response", state.responseListener);
}

export function clearPageAccessChallengeHandling(page: Page): void {
  const state = pageSafetyStates.get(page);
  if (state?.responseListener) {
    const eventPage = page as { off?: (event: "response", listener: (response: Response) => void) => void };
    eventPage.off?.("response", state.responseListener);
  }
  pageSafetyStates.delete(page);
}

export function pageHadAccessChallenge(page: Page): boolean {
  return pageSafetyStates.get(page)?.accessChallengeDetected ?? false;
}

function markPageAccessChallengeDetected(page: Page): PageSafetyState | undefined {
  const state = pageSafetyStates.get(page);
  if (!state) {
    return undefined;
  }

  state.accessChallengeDetected = true;
  return state;
}

function releaseBrowserRunLock(lockPath: string, token: string): void {
  const currentToken = readBrowserRunLockToken(lockPath);
  if (currentToken !== token) {
    return;
  }

  rmSync(lockPath, { force: true });
}

interface BrowserRunLockDetails {
  token?: string;
  pid?: number;
  createdAt?: number;
}

function browserRunLockStaleReason(
  lockPath: string,
  nowMs: number,
  details = readBrowserRunLockDetails(lockPath)
): BrowserRunLockStatus["staleReason"] | undefined {
  if (details.pid !== undefined && !isProcessAlive(details.pid)) {
    return "process_not_running";
  }

  const createdAt = details.createdAt;
  if (createdAt === undefined) {
    return undefined;
  }

  if (nowMs - createdAt > BROWSER_RUN_LOCK_STALE_MS) {
    return "expired";
  }

  return undefined;
}

function readBrowserRunLockDetails(lockPath: string): BrowserRunLockDetails {
  try {
    const lock = JSON.parse(readFileSync(lockPath, "utf8")) as {
      token?: unknown;
      pid?: unknown;
      createdAt?: unknown;
    };
    return {
      ...(typeof lock.token === "string" ? { token: lock.token } : {}),
      ...(typeof lock.pid === "number" && Number.isInteger(lock.pid) ? { pid: lock.pid } : {}),
      ...(typeof lock.createdAt === "number" && isValidLockTimestamp(lock.createdAt)
        ? { createdAt: lock.createdAt }
        : {})
    };
  } catch {
    try {
      return {
        createdAt: statSync(lockPath).mtimeMs
      };
    } catch {
      return {};
    }
  }
}

function readBrowserRunLockToken(lockPath: string): string | undefined {
  return readBrowserRunLockDetails(lockPath).token;
}

function isValidLockTimestamp(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 8.64e15;
}

function isProcessAlive(pid: number): boolean {
  if (pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "EPERM";
  }
}

function toBrowserLockCreateError(error: unknown): UserFacingError {
  const detail = firstErrorLine(error);
  const detailText = detail ? ` Details: ${detail}` : "";

  return new UserFacingError("Could not create the ZepoCli browser automation lock.", {
    code: "browser_lock_failed",
    hint: `Check that the configured data directory is writable, then rerun \`zepo doctor\`.${detailText}`
  });
}

function isFileExistsError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "EEXIST";
}

export function shouldCaptureBrowserFailure(
  options: Pick<BrowserRunOptions, "captureFailures">,
  debug: boolean
): boolean {
  return debug && (options.captureFailures ?? true);
}

export function shouldSaveBrowserState(options: Pick<BrowserRunOptions, "requireSession" | "saveState">): boolean {
  return options.saveState ?? options.requireSession === true;
}

export function shouldCheckExpiredSession(
  options: Pick<BrowserRunOptions, "checkExpiredSession" | "requireSession">
): boolean {
  return options.requireSession === true && options.checkExpiredSession !== false;
}

export function computeBrowserPacingDelay(lastRunAt: string | undefined, nowMs = Date.now()): number {
  if (!lastRunAt) {
    return 0;
  }

  const timestamp = Number.parseInt(lastRunAt, 10);
  if (!Number.isFinite(timestamp)) {
    return 0;
  }

  const elapsedMs = nowMs - timestamp;
  if (elapsedMs < 0) {
    return BROWSER_RUN_PACING_MS;
  }

  return Math.max(0, BROWSER_RUN_PACING_MS - elapsedMs);
}

export function computeAccessChallengeCooldownDelay(lastChallengeAt: string | undefined, nowMs = Date.now()): number {
  if (!lastChallengeAt) {
    return 0;
  }

  const timestamp = Number.parseInt(lastChallengeAt, 10);
  if (!Number.isFinite(timestamp)) {
    return 0;
  }

  const elapsedMs = nowMs - timestamp;
  if (elapsedMs < 0) {
    return ACCESS_CHALLENGE_COOLDOWN_MS;
  }

  return Math.max(0, ACCESS_CHALLENGE_COOLDOWN_MS - elapsedMs);
}

export function recordHeadlessBrowserRun(runHistory: string | undefined, nowMs = Date.now()): string {
  const recentRuns = recentHeadlessBrowserRuns(runHistory, nowMs);
  recentRuns.push(nowMs);
  return JSON.stringify(recentRuns.slice(-HEADLESS_BROWSER_BURST_LIMIT));
}

export function getHeadlessBrowserThrottleStatus(
  runHistory: string | undefined,
  nowMs = Date.now()
): BrowserRunThrottleStatus {
  const recentRuns = recentHeadlessBrowserRuns(runHistory, nowMs);
  const retryAfterMs =
    recentRuns.length >= HEADLESS_BROWSER_BURST_LIMIT
      ? Math.max(0, recentRuns[0]! + HEADLESS_BROWSER_BURST_WINDOW_MS - nowMs)
      : 0;

  return {
    windowMs: HEADLESS_BROWSER_BURST_WINDOW_MS,
    limit: HEADLESS_BROWSER_BURST_LIMIT,
    recentRuns: recentRuns.length,
    throttleActive: retryAfterMs > 0,
    retryAfterMs
  };
}

export function assertHeadlessBrowserRunBudget(runHistory: string | undefined, nowMs = Date.now()): void {
  const status = getHeadlessBrowserThrottleStatus(runHistory, nowMs);
  if (!status.throttleActive) {
    return;
  }

  throw new UserFacingError("Headless browser automation is cooling down after many recent Zepto commands.", {
    code: "headless_browser_throttle",
    hint: `Wait ${formatWait(status.retryAfterMs)} before retrying headless commands, or rerun with \`--visible\` for a human-controlled browser flow. Do not loop rapid Zepto commands from agents.`,
    retryAfterMs: status.retryAfterMs
  });
}

export function assertNoAccessChallengeCooldown(lastChallengeAt: string | undefined, nowMs = Date.now()): void {
  const status = getAccessChallengeCooldownStatus(lastChallengeAt, nowMs);
  if (!status.cooldownActive) {
    return;
  }

  throw new UserFacingError("Recent Zepto verification or block was detected; pausing headless browser automation.", {
    code: "zepto_access_cooldown",
    hint: `Wait ${formatWait(status.retryAfterMs)} or rerun with \`--visible\` to resolve Zepto-controlled verification manually. Do not loop headless commands or bypass platform checks.`,
    retryAfterMs: status.retryAfterMs
  });
}

export function getAccessChallengeCooldownStatus(
  lastChallengeAt: string | undefined,
  nowMs = Date.now()
): AccessChallengeStatus {
  const timestamp = parseMetaTimestamp(lastChallengeAt);
  if (timestamp === undefined) {
    return {
      detected: false,
      cooldownActive: false,
      retryAfterMs: 0
    };
  }

  const retryAfterMs = computeAccessChallengeCooldownDelay(lastChallengeAt, nowMs);
  return {
    detected: true,
    lastDetectedAt: new Date(timestamp).toISOString(),
    cooldownActive: retryAfterMs > 0,
    retryAfterMs
  };
}

export function toBrowserLaunchError(error: unknown): UserFacingError {
  const detail = firstErrorLine(error);
  const detailText = detail ? ` Details: ${detail}` : "";

  return new UserFacingError("Could not launch Playwright Chromium.", {
    code: "browser_launch_failed",
    hint: `Run \`npm run prepare:browsers\` or \`npx playwright install chromium\`, then rerun \`zepo doctor\`. If Chromium is already installed, check that the configured data directory is writable.${detailText}`
  });
}

function firstErrorLine(error: unknown): string | undefined {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
}

function confirmedSessionHint(status: SessionStatus): string {
  if (!status.hasAuthState) {
    return "Run `zepo login` first.";
  }

  if (!status.markedLoggedIn) {
    return "Run `zepo login` again and confirm only after Zepto shows your account.";
  }

  if (!status.hasBrowserProfileData) {
    return "The persistent browser profile is missing. Run `zepo login` again.";
  }

  return "Run `zepo status` to inspect local session state, then retry `zepo login` if needed.";
}

export async function gotoZepto(page: Page, path = "/"): Promise<void> {
  const url = new URL(path, BASE_URL).toString();
  await gotoWithAccessProtection(page, url);
}

export async function gotoWithAccessProtection(page: Page, url: string | URL): Promise<void> {
  const response = await page.goto(String(url), { waitUntil: "domcontentloaded" });
  assertNoAccessChallengeResponse(response);
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  await assertNoAccessChallenge(page);
}

export function assertNoAccessChallengeResponse(response: Pick<Response, "status"> | null | undefined): void {
  const status = response?.status();
  if (status !== 403 && status !== 429) {
    return;
  }

  throw new UserFacingError(ACCESS_CHALLENGE_MESSAGE, {
    code: "zepto_access_challenge",
    hint: `Zepto returned HTTP ${status}. Stop repeated automation, open the flow with \`--visible\`, and retry later. Do not bypass platform checks.`,
    retryAfterMs: ACCESS_CHALLENGE_COOLDOWN_MS
  });
}

export async function assertNoAccessChallenge(page: Page): Promise<void> {
  const state = pageSafetyStates.get(page);
  const responseSignal = state?.accessChallengeResponse;
  if (responseSignal) {
    if (state?.allowManualAccessChallengeResolution) {
      const resolved = await waitForVisibleAccessChallengeResolution(page, state.manualAccessChallengeWaitMs);
      if (resolved) {
        state.accessChallengeResponse = undefined;
        return;
      }
    }

    throw accessChallengeResponseError(responseSignal);
  }

  const title = await page.title().catch(() => "");
  const bodyText = await page.locator("body").innerText().catch(() => "");
  if (!isAccessChallengeText(`${title}\n${bodyText}`)) {
    return;
  }

  const detectedState = markPageAccessChallengeDetected(page);
  if (detectedState?.allowManualAccessChallengeResolution) {
    const resolved = await waitForVisibleAccessChallengeResolution(page, detectedState.manualAccessChallengeWaitMs);
    if (resolved) {
      return;
    }
  }

  throw new UserFacingError(ACCESS_CHALLENGE_MESSAGE, {
    code: "zepto_access_challenge",
    hint:
      "Stop repeated automation, open the flow with `--visible`, complete any Zepto-controlled verification manually, and retry later. Do not bypass platform checks.",
    retryAfterMs: ACCESS_CHALLENGE_COOLDOWN_MS
  });
}

function blockedZeptoResponseSignal(response: Response): AccessChallengeResponseSignal | undefined {
  const status = response.status();
  if (status !== 403 && status !== 429) {
    return undefined;
  }

  const resourceType = response.request().resourceType();
  if (!["document", "fetch", "xhr"].includes(resourceType)) {
    return undefined;
  }

  const url = response.url();
  if (!isZeptoOrigin(url)) {
    return undefined;
  }

  return {
    status,
    url: urlWithoutQuery(url)
  };
}

function accessChallengeResponseError(signal: AccessChallengeResponseSignal): UserFacingError {
  return new UserFacingError(ACCESS_CHALLENGE_MESSAGE, {
    code: "zepto_access_challenge",
    hint: `Zepto returned HTTP ${signal.status} from ${signal.url}. Stop repeated automation, open the flow with \`--visible\`, and retry later. Do not bypass platform checks.`,
    retryAfterMs: ACCESS_CHALLENGE_COOLDOWN_MS
  });
}

function isZeptoOrigin(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    const baseHostname = new URL(BASE_URL).hostname.toLowerCase();
    return (
      hostname === baseHostname ||
      hostname.endsWith(`.${baseHostname}`) ||
      hostname === "zeptonow.com" ||
      hostname.endsWith(".zeptonow.com") ||
      hostname.endsWith(".zepto.com")
    );
  } catch {
    return false;
  }
}

function urlWithoutQuery(value: string): string {
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return value;
  }
}

async function waitForVisibleAccessChallengeResolution(page: Page, timeoutMs: number): Promise<boolean> {
  await page
    .waitForFunction(
      (patternSource) => {
        const normalized = `${document.title}\n${document.body?.innerText ?? ""}`
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
        return !new RegExp(patternSource, "i").test(normalized);
      },
      ACCESS_CHALLENGE_TEXT_PATTERN.source,
      { timeout: timeoutMs }
    )
    .catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);

  const title = await page.title().catch(() => "");
  const bodyText = await page.locator("body").innerText().catch(() => "");
  return !isAccessChallengeText(`${title}\n${bodyText}`);
}

export function isAccessChallengeError(error: unknown): boolean {
  return error instanceof UserFacingError && error.code === "zepto_access_challenge";
}

export function isAccessProtectionError(error: unknown): boolean {
  return (
    isAccessChallengeError(error) ||
    (error instanceof UserFacingError && error.code === "zepto_access_protection")
  );
}

export function isAccessChallengeText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return ACCESS_CHALLENGE_TEXT_PATTERN.test(normalized);
}

export async function isLoginRequiredPage(page: Page): Promise<boolean> {
  const bodyText = await page.locator("body").innerText().catch(() => "");
  if (isLoginRequiredText(bodyText)) {
    return true;
  }

  if (isLoggedInAccountText(bodyText)) {
    return false;
  }

  const phoneInput = page.locator("input[type='tel'], input[inputmode='numeric'], input[name*='phone' i]").first();
  return phoneInput.isVisible().catch(() => false);
}

export function isLoginRequiredText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (LOGIN_REQUIRED_TEXT_PATTERN.test(normalized)) {
    return true;
  }

  return /\blogin\b/i.test(normalized) && !/\b(my orders|order history|wallet|logout|log out)\b/i.test(
    normalized
  );
}

function isLoggedInAccountText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (/\b(logout|log out)\b/i.test(normalized)) {
    return true;
  }

  const hasAccountEntry = /\b(account|profile)\b/i.test(normalized);
  const hasAccountOnlyFeature = /\b(wallet|my orders|orders|order history)\b/i.test(normalized);
  return hasAccountEntry && hasAccountOnlyFeature;
}

function expiredSessionError(): UserFacingError {
  return new UserFacingError("Zepto session appears to require login again.", {
    code: "zepto_login_required",
    hint:
      "Run `zepo login` again, then retry the command. Agents should run `zepo status --live --json` before account workflows."
  });
}

function parseMetaTimestamp(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const timestamp = Number.parseInt(value, 10);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function recentHeadlessBrowserRuns(runHistory: string | undefined, nowMs: number): number[] {
  return parseHeadlessBrowserRunHistory(runHistory)
    .filter((timestamp) => nowMs - timestamp < HEADLESS_BROWSER_BURST_WINDOW_MS)
    .sort((left, right) => left - right);
}

function parseHeadlessBrowserRunHistory(runHistory: string | undefined): number[] {
  if (!runHistory) {
    return [];
  }

  try {
    const parsed = JSON.parse(runHistory) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    }
  } catch {
    const timestamp = Number.parseInt(runHistory, 10);
    return Number.isFinite(timestamp) ? [timestamp] : [];
  }

  return [];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatWait(ms: number): string {
  const seconds = Math.ceil(ms / 1_000);
  if (seconds < 60) {
    return `${seconds} second${seconds === 1 ? "" : "s"}`;
  }

  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function browserAutomationReadinessHint(
  reasons: BrowserAutomationReadinessReason[],
  retryAfterMs: number
): string {
  const hints: string[] = [];
  if (reasons.includes("browser_lock_active")) {
    hints.push("wait for the active browser command to finish");
  }
  if (retryAfterMs > 0) {
    hints.push(`wait ${formatWait(retryAfterMs)}`);
  }
  if (reasons.includes("zepto_access_cooldown")) {
    hints.push("use `--visible` only when a human can complete Zepto-controlled verification");
  }

  return `${sentenceJoin(hints)}. Do not loop headless Zepto commands or bypass platform checks.`;
}

function sentenceJoin(parts: string[]): string {
  if (parts.length === 0) {
    return "inspect `zepo doctor --json`";
  }

  if (parts.length === 1) {
    return parts[0]!;
  }

  return `${parts.slice(0, -1).join(", ")}, or ${parts[parts.length - 1]}`;
}

