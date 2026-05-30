import { confirm, input } from "@inquirer/prompts";

import type { AppRuntime } from "../config/runtime.js";
import { BrowserAutomation, getBrowserRunLockStatus } from "../automation/browser.js";
import { detectLoginState, openAccountSurface, openLoginFlow, type LoginState } from "../automation/auth.js";
import type { BrowserRunLockStatus, LiveSessionStatus, SessionStatus } from "../types.js";
import { UserFacingError } from "../utils/errors.js";
import { requireInteractiveInput } from "../utils/interactive.js";
import { promptContext } from "../utils/prompts.js";

export class AuthService {
  private readonly browser: BrowserAutomation;

  constructor(private readonly runtime: AppRuntime) {
    this.browser = new BrowserAutomation(runtime);
  }

  async login(phone?: string): Promise<void> {
    const normalizedPhone = normalizeLoginPhone(phone);

    requireInteractiveInput(
      this.runtime,
      "Zepto login requires interactive input.",
      "Rerun `zepo login` without `--no-input` so you can complete Zepto login or OTP in the browser."
    );

    const previousStatus = this.runtime.session.status();
    const previousSessionSnapshot = shouldPreserveExistingSessionAfterLoginFailure(previousStatus)
      ? this.runtime.session.createSnapshot()
      : undefined;

    try {
      await this.browser.withPage({ captureFailures: false, headless: false, saveState: true }, async (page) => {
        await openLoginFlow(page, normalizedPhone);
        await input(
          {
            message: "Complete Zepto login in the browser, then press Enter here"
          },
          promptContext()
        );

        const loginState = await detectLoginState(page);
        if (loginState === "login-required") {
          throw new UserFacingError("Zepto login does not appear complete.", {
            code: "zepto_login_required",
            hint: "Finish OTP/login in the browser before pressing Enter."
          });
        }

        if (loginState === "unknown") {
          const confirmed = await confirm(
            {
              message: "Does the browser show your Zepto account as logged in?",
              default: false
            },
            promptContext()
          );

          if (!confirmed) {
            throw new UserFacingError("Zepto login was not confirmed.", {
              code: "login_not_confirmed",
              hint: "Run `zepo login` again and confirm only after Zepto shows your account."
            });
          }
        }
      });

      this.runtime.session.markLoggedIn();
      assertSavedLoginSession(this.runtime.session.status());
    } catch (error) {
      if (previousSessionSnapshot) {
        this.runtime.session.restoreSnapshot(previousSessionSnapshot);
        this.runtime.session.markLoggedIn();
      } else {
        this.runtime.session.markLoggedOut();
      }
      throw error;
    } finally {
      if (previousSessionSnapshot) {
        this.runtime.session.disposeSnapshot(previousSessionSnapshot);
      }
    }
  }

  logout(): void {
    assertNoActiveBrowserRunLockForLogout(getBrowserRunLockStatus(this.runtime.paths.browserLockPath));
    this.runtime.session.clear();
  }

  async checkLiveSession(): Promise<LiveSessionStatus> {
    const localStatus = this.runtime.session.status();
    if (!localStatus.confirmedSession) {
      return {
        checked: false,
        state: "skipped",
        checkedAt: new Date().toISOString(),
        demotedLocalSession: false,
        message: "No confirmed local Zepto session is available for live verification.",
        hint: "Run `zepo login` first."
      };
    }

    const state = await this.browser.withPage(
      { captureFailures: false, requireSession: true, saveState: true, checkExpiredSession: false },
      async (page) => {
        await openAccountSurface(page);
        return detectLoginState(page);
      }
    );

    return liveSessionStatusFromLoginState(state, this.runtime);
  }
}

export function liveSessionStatusFromLoginState(state: LoginState, runtime: AppRuntime): LiveSessionStatus {
  if (state === "login-required") {
    runtime.session.markLoggedOut();
    return {
      checked: true,
      state,
      checkedAt: new Date().toISOString(),
      demotedLocalSession: true,
      message: "Zepto asked for login or OTP again; the local session marker was demoted.",
      hint: "Run `zepo login` again before account-dependent commands."
    };
  }

  if (state === "logged-in") {
    return {
      checked: true,
      state,
      checkedAt: new Date().toISOString(),
      demotedLocalSession: false,
      message: "Zepto accepted the saved browser session."
    };
  }

  return {
    checked: true,
    state,
    checkedAt: new Date().toISOString(),
    demotedLocalSession: false,
    message: "Zepto loaded, but the CLI could not confidently verify the account state.",
    hint: "Rerun `zepo status --live --visible` or `zepo login` before checkout-critical work."
  };
}

export function shouldPreserveExistingSessionAfterLoginFailure(status: Pick<SessionStatus, "confirmedSession">): boolean {
  return status.confirmedSession;
}

export function assertSavedLoginSession(status: Pick<SessionStatus, "confirmedSession">): void {
  if (status.confirmedSession) {
    return;
  }

  throw new UserFacingError("Zepto login finished, but no usable local session was saved.", {
    code: "session_save_failed",
    hint: "Run `zepo login` again and continue only after Zepto shows your account, address, or cart in the browser."
  });
}

export function assertNoActiveBrowserRunLockForLogout(lock: BrowserRunLockStatus): void {
  if (!lock.present || lock.stale) {
    return;
  }

  throw new UserFacingError("Another ZepoCli browser command is already running for this data directory.", {
    code: "browser_lock_active",
    hint:
      "Wait for the browser command to finish before running `zepo logout`. If no command is running, inspect `zepo doctor` before removing the stale browser lock."
  });
}

export function normalizeLoginPhone(phone: string | undefined): string | undefined {
  if (phone === undefined) {
    return undefined;
  }

  const trimmed = phone.trim();
  if (!/^\+?[\d\s-]+$/.test(trimmed)) {
    throw invalidLoginPhoneError();
  }

  const digits = trimmed.replace(/\D/g, "");
  const normalized = normalizeIndianMobileDigits(digits);
  if (normalized) {
    return normalized;
  }

  throw invalidLoginPhoneError();
}

function invalidLoginPhoneError(): UserFacingError {
  return new UserFacingError("Phone number must be a valid 10-digit Indian mobile number.", {
    code: "invalid_input",
    hint: "Use a value like `zepo login --phone 9876543210`."
  });
}

function normalizeIndianMobileDigits(digits: string): string | undefined {
  if (/^[6-9]\d{9}$/.test(digits)) {
    return digits;
  }

  if (/^91[6-9]\d{9}$/.test(digits)) {
    return digits.slice(2);
  }

  if (/^0[6-9]\d{9}$/.test(digits)) {
    return digits.slice(1);
  }

  return undefined;
}
