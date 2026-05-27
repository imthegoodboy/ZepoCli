import chalk from "chalk";
import type { Command } from "commander";

import { ZeptoService } from "../services/zepto.js";
import { printJson } from "../utils/output.js";
import { withRuntime } from "./shared.js";

export function registerCheckoutCommand(program: Command): void {
  program
    .command("checkout")
    .description("Open Zepto checkout for user-completed payment")
    .option("--json", "print machine-readable JSON")
    .action((options: { json?: boolean }, command: Command) =>
      withRuntime(command, async (runtime) => {
        await new ZeptoService(runtime).checkout.checkout();
        if (options.json) {
          printJson({
            status: "checkout_handoff_finished",
            payment: "handled_by_zepto"
          });
          return;
        }

        console.log(chalk.green("Checkout handoff finished. Payment stayed inside Zepto."));
      })
    );
}
