import chalk from "chalk";
import type { Command } from "commander";

import { printJson } from "../utils/output.js";
import { wantsJson, withRuntime } from "./shared.js";

export function registerCheckoutCommand(program: Command): void {
  program
    .command("checkout")
    .description("Open Zepto checkout for user-completed payment")
    .option("--json", "print machine-readable JSON")
    .action((options: { json?: boolean }, command: Command) =>
      withRuntime(command, async (runtime) => {
        const { ZeptoService } = await import("../services/zepto.js");
        const json = wantsJson(command, options);
        await new ZeptoService(runtime).checkout.checkout();
        if (json) {
          printJson(checkoutHandoffOutput());
          return;
        }

        console.log(
          chalk.green("Checkout handoff returned to CLI. Payment/order status stays inside Zepto; run `zepo track` after payment.")
        );
      })
    );
}

export interface CheckoutHandoffOutput {
  status: "checkout_handoff_returned";
  payment: "handled_by_zepto";
  paymentStatus: "not_observed_by_zepocli";
  orderPlacement: "not_confirmed_by_zepocli";
  orderStatusCommand: "zepo track";
  next: string;
}

export function checkoutHandoffOutput(): CheckoutHandoffOutput {
  return {
    status: "checkout_handoff_returned",
    payment: "handled_by_zepto",
    paymentStatus: "not_observed_by_zepocli",
    orderPlacement: "not_confirmed_by_zepocli",
    orderStatusCommand: "zepo track",
    next: "Complete payment in Zepto, then run `zepo track` to inspect order status."
  };
}
