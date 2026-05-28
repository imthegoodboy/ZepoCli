import { input } from "@inquirer/prompts";

import type { AppRuntime } from "../config/runtime.js";
import { BrowserAutomation } from "../automation/browser.js";
import { openCheckout } from "../automation/checkout.js";
import { requireInteractiveInput } from "../utils/interactive.js";
import { promptContext } from "../utils/prompts.js";

export class CheckoutService {
  private readonly browser: BrowserAutomation;

  constructor(private readonly runtime: AppRuntime) {
    this.browser = new BrowserAutomation(runtime);
  }

  async checkout(): Promise<void> {
    requireInteractiveInput(
      this.runtime,
      "Zepto checkout requires interactive input.",
      "Rerun `zepo checkout` without `--no-input` so payment stays inside the visible Zepto browser."
    );

    await this.browser.withPage(
      { captureFailures: false, requireSession: true, headless: false, saveState: true },
      async (page) => {
        await openCheckout(page);
        await input(
          {
            message: "Use Zepto checkout/payment in the browser, then press Enter here when done"
          },
          promptContext()
        );
      }
    );
  }
}
