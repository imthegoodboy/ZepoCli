import { confirm, input } from "@inquirer/prompts";

import type { AppRuntime } from "../config/runtime.js";
import { BrowserAutomation } from "../automation/browser.js";
import { detectLoginState, openLoginFlow } from "../automation/auth.js";
import type { SessionStatus } from "../types.js";
import { UserFacingError } from "../utils/errors.js";
import { requireInteractiveInput } from "../utils/interactive.js";

export class AuthService {
  private readonly browser: BrowserAutomation;

  constructor(private readonly runtime: AppRuntime) {
    this.browser = new BrowserAutomation(runtime);
  }

  async login(phone?: string): Promise<void> {
    requireInteractiveInput(
      this.runtime,
      "Zepto login requires interactive input.",
      "Rerun `zepo login` without `--no-input` so you can complete Zepto login or OTP in the browser."
    );

    const previousStatus = this.runtime.session.status();

    try {
      await this.browser.withPage({ headless: false, saveState: true }, async (page) => {
        await openLoginFlow(page, phone);
        await input({
          message: "Complete Zepto login in the browser, then press Enter here"
        });

        const loginState = await detectLoginState(page);
        if (loginState === "login-required") {
          throw new UserFacingError("Zepto login does not appear complete.", {
            hint: "Finish OTP/login in the browser before pressing Enter."
          });
        }

        if (loginState === "unknown") {
          const confirmed = await confirm({
            message: "Does the browser show your Zepto account as logged in?",
            default: false
          });

          if (!confirmed) {
            throw new UserFacingError("Zepto login was not confirmed.", {
              hint: "Run `zepo login` again and confirm only after Zepto shows your account."
            });
          }
        }
      });

      this.runtime.session.markLoggedIn();
      assertSavedLoginSession(this.runtime.session.status());
    } catch (error) {
      if (!shouldPreserveExistingSessionAfterLoginFailure(previousStatus)) {
        this.runtime.session.markLoggedOut();
      }
      throw error;
    }
  }

  logout(): void {
    this.runtime.session.clear();
  }
}

export function shouldPreserveExistingSessionAfterLoginFailure(status: Pick<SessionStatus, "confirmedSession">): boolean {
  return status.confirmedSession;
}

export function assertSavedLoginSession(status: Pick<SessionStatus, "confirmedSession">): void {
  if (status.confirmedSession) {
    return;
  }

  throw new UserFacingError("Zepto login finished, but no usable local session was saved.", {
    hint: "Run `zepo login` again and continue only after Zepto shows your account, address, or cart in the browser."
  });
}
