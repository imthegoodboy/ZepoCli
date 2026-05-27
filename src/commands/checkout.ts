import chalk from "chalk";
import type { Command } from "commander";

import { ZeptoService } from "../services/zepto.js";
import { withRuntime } from "./shared.js";

export function registerCheckoutCommand(program: Command): void {
  program
    .command("checkout")
    .description("Open Zepto checkout for user-completed payment")
    .action((_options: unknown, command: Command) =>
      withRuntime(command, async (runtime) => {
        await new ZeptoService(runtime).checkout.checkout();
        console.log(chalk.green("Checkout handoff finished. Payment stayed inside Zepto."));
      })
    );
}
