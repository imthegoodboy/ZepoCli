import { input } from "@inquirer/prompts";

import type { AppRuntime } from "../config/runtime.js";
import { assertConfirmedSession, BrowserAutomation } from "../automation/browser.js";
import { openCheckout, type CheckoutHandoffResult } from "../automation/checkout.js";
import { requireInteractiveInput, requireVisibleBrowser } from "../utils/interactive.js";
import { promptContext } from "../utils/prompts.js";

export class CheckoutService {
  private readonly browser: BrowserAutomation;

  constructor(private readonly runtime: AppRuntime) {
    this.browser = new BrowserAutomation(runtime);
  }

  async checkout(options: { waitForCompletion?: boolean } = {}): Promise<CheckoutHandoffResult> {
    const waitForCompletion = options.waitForCompletion ?? true;
    if (waitForCompletion) {
      requireInteractiveInput(
        this.runtime,
        "Zepto checkout requires interactive input.",
        "Rerun `zepo --visible checkout` without `--no-input` so payment stays inside the visible Zepto browser."
      );
    }
    requireVisibleBrowser(
      this.runtime,
      "Zepto checkout requires a visible browser.",
      "Rerun `zepo --visible checkout` so checkout/payment stays in a human-controlled Zepto browser."
    );
    assertConfirmedSession(this.runtime);

    return this.browser.withPage(
      { captureFailures: false, requireSession: true, headless: false, saveState: true },
      async (page) => {
        const handoff = (await openCheckout(page)) ?? { mode: "checkout_or_payment_page" as const };
        if (waitForCompletion) {
          await input(
            {
              message: checkoutPromptMessage(handoff)
            },
            promptContext()
          );
        }
        return handoff;
      }
    );
  }
}

function checkoutPromptMessage(handoff: CheckoutHandoffResult): string {
  if (handoff.mode === "manual_payment_control_visible") {
    return "Click the Zepto payment control in the browser, complete only the Zepto-side actions you choose, then press Enter here";
  }

  return "Use Zepto checkout/payment in the browser, then press Enter here when done";
}
