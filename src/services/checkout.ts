import { input } from "@inquirer/prompts";

import type { AppRuntime } from "../config/runtime.js";
import { assertConfirmedSession, BrowserAutomation } from "../automation/browser.js";
import {
  CHECKOUT_PAYMENT_LINK_SESSION,
  ZEPTO_CHECKOUT_HANDOFF_URL
} from "../config/constants.js";
import {
  detectCheckoutHandoffMode,
  openCheckout,
  type CheckoutHandoffResult
} from "../automation/checkout.js";
import { requireInteractiveInput, requireVisibleBrowser } from "../utils/interactive.js";
import { promptContext } from "../utils/prompts.js";

export class CheckoutService {
  private readonly browser: BrowserAutomation;

  constructor(private readonly runtime: AppRuntime) {
    this.browser = new BrowserAutomation(runtime);
  }

  async checkout(options: { waitForCompletion?: boolean; removeLimitItems?: boolean } = {}): Promise<CheckoutHandoffResult> {
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
        let handoff = await openCheckout(page, { removeLimitItems: options.removeLimitItems === true });
        if (waitForCompletion) {
          printCheckoutWaitHandoffGuidance(handoff);
          await input(
            {
              message: checkoutPromptMessage(handoff)
            },
            promptContext()
          );
          const detectedHandoff = await detectCheckoutHandoffMode(page).catch(() => undefined);
          handoff = detectedHandoff
            ? {
                ...handoff,
                mode: detectedHandoff.mode,
                manualPaymentControlVisible: detectedHandoff.mode === "manual_payment_control_visible"
              }
            : handoff;
        }
        return handoff;
      }
    );
  }
}

function printCheckoutWaitHandoffGuidance(handoff: CheckoutHandoffResult): void {
  const boundary =
    handoff.mode === "manual_payment_control_visible"
      ? "Zepto shows a human-only cart payment control. ZepoCli will not click it."
      : "Zepto checkout is open in the visible browser. ZepoCli will not click payment/order controls.";

  console.error(boundary);
  console.error(`Payment link: ${ZEPTO_CHECKOUT_HANDOFF_URL}`);
  console.error(`Payment link session: ${CHECKOUT_PAYMENT_LINK_SESSION}`);
  console.error("Open in the user's Zepto session; Zepto handles payment.");
  console.error("After any Zepto-side order action, run `zepo track`.");
}

function checkoutPromptMessage(handoff: CheckoutHandoffResult): string {
  if (handoff.mode === "manual_payment_control_visible") {
    return "Continue manually in the Zepto browser, complete only the Zepto-side actions you choose, then press Enter here";
  }

  return "Use Zepto checkout/payment in the browser, then press Enter here when done";
}
