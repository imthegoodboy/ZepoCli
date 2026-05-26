import { input } from "@inquirer/prompts";

import type { AppRuntime } from "../config/runtime.js";
import { BrowserAutomation } from "../automation/browser.js";
import { openLoginFlow } from "../automation/auth.js";

export class AuthService {
  private readonly browser: BrowserAutomation;

  constructor(private readonly runtime: AppRuntime) {
    this.browser = new BrowserAutomation(runtime);
  }

  async login(phone?: string): Promise<void> {
    await this.browser.withPage({ headless: false, saveState: true }, async (page) => {
      await openLoginFlow(page, phone);
      await input({
        message: "Complete Zepto login in the browser, then press Enter here"
      });
    });

    this.runtime.session.markLoggedIn();
  }

  logout(): void {
    this.runtime.session.clear();
  }
}
