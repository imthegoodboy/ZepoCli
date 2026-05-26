import { input } from "@inquirer/prompts";

import type { AppRuntime } from "../config/runtime.js";
import { BrowserAutomation } from "../automation/browser.js";
import { openCheckout } from "../automation/checkout.js";

export class CheckoutService {
  private readonly browser: BrowserAutomation;

  constructor(private readonly runtime: AppRuntime) {
    this.browser = new BrowserAutomation(runtime);
  }

  async checkout(): Promise<void> {
    await this.browser.withPage({ requireSession: true, headless: false, saveState: true }, async (page) => {
      await openCheckout(page);
      await input({
        message: "Complete checkout/payment in the browser, then press Enter here"
      });
    });
  }
}
