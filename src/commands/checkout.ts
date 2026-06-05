import chalk from "chalk";
import type { Command } from "commander";

import type { CheckoutHandoffMode } from "../automation/checkout.js";
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
          printJson(checkoutHandoffOutput(handoff.mode, { waitForCompletion }));
          return;
        }

        const message =
          handoff.mode === "manual_payment_control_visible"
            ? "Zepto showed a cart-side payment control. Continue manually in the visible browser; payment/order status stays inside Zepto."
            : "Checkout handoff returned to CLI after a readable cart check. Payment/order status stays inside Zepto; run `zepo track` after payment.";
        console.log(
          chalk.green(message)
        );
      })
    );
}

export interface CheckoutHandoffOutput {
  status: "checkout_handoff_returned" | "checkout_manual_action_required";
  payment: "handled_by_zepto";
  humanActionRequired: true;
  automationBoundary: "zepocli_did_not_click_payment_or_order_controls";
  handoffUrl: "https://www.zepto.com/?cart=open";
  handoffSurface: "visible_zepto_browser";
  browserOpenAfterReturn: false;
  cartPrecondition: "non_empty_cart_verified";
  paymentStatus: "not_observed_by_zepocli";
  orderPlacement: "not_confirmed_by_zepocli";
  orderStatusCommand: "zepo track";
  next: string;
}

export function checkoutHandoffOutput(
  mode: CheckoutHandoffMode = "checkout_or_payment_page",
  options: { waitForCompletion?: boolean } = {}
): CheckoutHandoffOutput {
  const waitForCompletion = options.waitForCompletion === true;

  if (mode === "manual_payment_control_visible") {
    return {
      status: "checkout_manual_action_required",
      payment: "handled_by_zepto",
      humanActionRequired: true,
      automationBoundary: "zepocli_did_not_click_payment_or_order_controls",
      handoffUrl: "https://www.zepto.com/?cart=open",
      handoffSurface: "visible_zepto_browser",
      browserOpenAfterReturn: false,
      cartPrecondition: "non_empty_cart_verified",
      paymentStatus: "not_observed_by_zepocli",
      orderPlacement: "not_confirmed_by_zepocli",
      orderStatusCommand: "zepo track",
      next: waitForCompletion
        ? "A human continued in Zepto before this command returned. ZepoCli still did not observe payment/order placement; after any Zepto-side order action, run `zepo track` to inspect order status."
        : "Run `zepo --visible checkout --wait` or human text checkout when a human must continue in Zepto. ZepoCli stops before payment/order controls; after any Zepto-side order action, run `zepo track` to inspect order status."
    };
  }

  return {
    status: "checkout_handoff_returned",
    payment: "handled_by_zepto",
    humanActionRequired: true,
    automationBoundary: "zepocli_did_not_click_payment_or_order_controls",
    handoffUrl: "https://www.zepto.com/?cart=open",
    handoffSurface: "visible_zepto_browser",
    browserOpenAfterReturn: false,
    cartPrecondition: "non_empty_cart_verified",
    paymentStatus: "not_observed_by_zepocli",
    orderPlacement: "not_confirmed_by_zepocli",
    orderStatusCommand: "zepo track",
    next: waitForCompletion
      ? "If payment/order was completed in Zepto before this command returned, run `zepo track` to inspect order status."
      : "Run `zepo --visible checkout --wait` or human text checkout when the browser must stay open for Zepto-side payment; after any Zepto-side order action, run `zepo track` to inspect order status."
  };
}
