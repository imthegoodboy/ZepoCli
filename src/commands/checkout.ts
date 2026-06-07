import chalk from "chalk";
import type { Command } from "commander";

import type { CheckoutCartEvidence, CheckoutHandoffMode } from "../automation/checkout.js";
import {
  CHECKOUT_AUTOMATION_BOUNDARY,
  CHECKOUT_PAYMENT_LINK_SESSION,
  ZEPTO_CHECKOUT_HANDOFF_URL
} from "../config/constants.js";
import { printJson } from "../utils/output.js";
import { wantsJson, withRuntime } from "./shared.js";

export function registerCheckoutCommand(program: Command): void {
  program
    .command("checkout")
    .description("Open Zepto checkout handoff (requires --visible)")
    .option("--json", "print machine-readable JSON")
    .option("--wait", "wait for a human Zepto-side checkout/payment action before returning")
    .option("--remove-limit-items", "click Zepto's Remove Items action for item-limit warnings before checkout")
    .action((options: { json?: boolean; wait?: boolean; removeLimitItems?: boolean }, command: Command) =>
      withRuntime(command, async (runtime) => {
        const { ZeptoService } = await import("../services/zepto.js");
        const json = wantsJson(command, options);
        const waitForCompletion = !json || options.wait === true;
        const handoff = await new ZeptoService(runtime).checkout.checkout({
          waitForCompletion,
          removeLimitItems: options.removeLimitItems === true
        });
        if (json) {
          printJson(checkoutHandoffOutput(handoff.mode, { waitForCompletion, cartEvidence: handoff.cartEvidence }));
          return;
        }

        const message =
          handoff.mode === "manual_payment_control_visible"
            ? "Zepto showed a cart-side payment control. Continue manually in the visible browser; payment/order status stays inside Zepto."
            : "Checkout handoff returned to CLI after a readable cart check. Payment/order status stays inside Zepto; run `zepo track` after payment.";
        console.log(
          chalk.green(message)
        );
        console.log(chalk.dim(`Payment link: ${ZEPTO_CHECKOUT_HANDOFF_URL}`));
        console.log(chalk.dim("Open in the user's Zepto session; Zepto handles payment."));
      })
    );
}

export interface CheckoutHandoffOutput {
  status: "checkout_handoff_returned" | "checkout_manual_action_required";
  payment: "handled_by_zepto";
  humanActionRequired: true;
  automationBoundary: typeof CHECKOUT_AUTOMATION_BOUNDARY;
  handoffUrl: typeof ZEPTO_CHECKOUT_HANDOFF_URL;
  paymentHandoffUrl: typeof ZEPTO_CHECKOUT_HANDOFF_URL;
  paymentLink: typeof ZEPTO_CHECKOUT_HANDOFF_URL;
  paymentLinkSession: typeof CHECKOUT_PAYMENT_LINK_SESSION;
  handoffSurface: "visible_zepto_browser";
  browserOpenAfterReturn: false;
  checkoutWaitCompleted: boolean;
  cartPrecondition: "non_empty_cart_verified";
  manualPaymentControlVisible: boolean;
  cartEvidence?: CheckoutCartEvidence;
  paymentStatus: "not_observed_by_zepocli";
  orderPlacement: "not_confirmed_by_zepocli";
  orderStatusCommand: "zepo track";
  next: string;
}

export function checkoutHandoffOutput(
  mode: CheckoutHandoffMode = "checkout_or_payment_page",
  options: { waitForCompletion?: boolean; cartEvidence?: CheckoutCartEvidence } = {}
): CheckoutHandoffOutput {
  const waitForCompletion = options.waitForCompletion === true;

  if (mode === "manual_payment_control_visible") {
    return {
      status: "checkout_manual_action_required",
      payment: "handled_by_zepto",
      humanActionRequired: true,
      automationBoundary: CHECKOUT_AUTOMATION_BOUNDARY,
      handoffUrl: ZEPTO_CHECKOUT_HANDOFF_URL,
      paymentHandoffUrl: ZEPTO_CHECKOUT_HANDOFF_URL,
      paymentLink: ZEPTO_CHECKOUT_HANDOFF_URL,
      paymentLinkSession: CHECKOUT_PAYMENT_LINK_SESSION,
      handoffSurface: "visible_zepto_browser",
      browserOpenAfterReturn: false,
      checkoutWaitCompleted: waitForCompletion,
      cartPrecondition: "non_empty_cart_verified",
      manualPaymentControlVisible: true,
      ...(options.cartEvidence ? { cartEvidence: options.cartEvidence } : {}),
      paymentStatus: "not_observed_by_zepocli",
      orderPlacement: "not_confirmed_by_zepocli",
      orderStatusCommand: "zepo track",
      next: waitForCompletion
        ? "A human continued in Zepto before this command returned. ZepoCli still did not observe payment/order placement; after any Zepto-side order action, run `zepo track` to inspect order status."
        : "Open `paymentLink` in the user's Zepto browser/session or run `zepo --visible checkout --wait` when a human must continue in Zepto. ZepoCli stops before payment/order controls; after any Zepto-side order action, run `zepo track` to inspect order status."
    };
  }

  return {
    status: "checkout_handoff_returned",
    payment: "handled_by_zepto",
    humanActionRequired: true,
    automationBoundary: CHECKOUT_AUTOMATION_BOUNDARY,
    handoffUrl: ZEPTO_CHECKOUT_HANDOFF_URL,
    paymentHandoffUrl: ZEPTO_CHECKOUT_HANDOFF_URL,
    paymentLink: ZEPTO_CHECKOUT_HANDOFF_URL,
    paymentLinkSession: CHECKOUT_PAYMENT_LINK_SESSION,
    handoffSurface: "visible_zepto_browser",
    browserOpenAfterReturn: false,
    checkoutWaitCompleted: waitForCompletion,
    cartPrecondition: "non_empty_cart_verified",
    manualPaymentControlVisible: false,
    ...(options.cartEvidence ? { cartEvidence: options.cartEvidence } : {}),
    paymentStatus: "not_observed_by_zepocli",
    orderPlacement: "not_confirmed_by_zepocli",
    orderStatusCommand: "zepo track",
    next: waitForCompletion
      ? "If payment/order was completed in Zepto before this command returned, run `zepo track` to inspect order status."
      : "Open `paymentLink` in the user's Zepto browser/session or run `zepo --visible checkout --wait` when the browser must stay open for Zepto-side payment; after any Zepto-side order action, run `zepo track` to inspect order status."
  };
}
