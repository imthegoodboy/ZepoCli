import { confirm, input } from "@inquirer/prompts";

import type { AppRuntime } from "../config/runtime.js";
import { BrowserAutomation } from "../automation/browser.js";
import { detectLoginState, openLoginFlow } from "../automation/auth.js";
import { UserFacingError } from "../utils/errors.js";

export class AuthService {
  private readonly browser: BrowserAutomation;

  constructor(private readonly runtime: AppRuntime) {
    this.browser = new BrowserAutomation(runtime);
  }

  async login(phone?: string): Promise<void> {
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
    } catch (error) {
      this.runtime.session.markLoggedOut();
      throw error;
    }
  }

  logout(): void {
    this.runtime.session.clear();
  }
}
