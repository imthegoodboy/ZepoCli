import ora from "ora";
import type { Command } from "commander";

import { ZeptoService } from "../services/zepto.js";
import { printCart } from "../utils/output.js";
import { joinQuery, withRuntime } from "./shared.js";

export function registerCartCommands(program: Command): void {
  program
    .command("cart")
    .description("Show Zepto cart")
    .option("--json", "print machine-readable JSON")
    .action((options: { json?: boolean }, command: Command) =>
      withRuntime(command, async (runtime) => {
        const spinner = options.json ? undefined : ora("Reading Zepto cart").start();
        const cart = await new ZeptoService(runtime).cart.read();
        spinner?.succeed("Cart loaded.");
        printCart(cart, options.json);
      })
    );

  program
    .command("remove")
    .description("Remove a matching item from the Zepto cart")
    .argument("<query...>", "cart item query")
    .action((queryParts: string[], _options: unknown, command: Command) =>
      withRuntime(command, async (runtime) => {
        const query = joinQuery(queryParts);
        const spinner = ora(`Removing "${query}"`).start();
        const cart = await new ZeptoService(runtime).cart.remove(query);
        spinner.succeed(`Removed matching item for "${query}".`);
        printCart(cart);
      })
    );

  program
    .command("clear")
    .description("Remove all detected items from the Zepto cart")
    .action((_options: unknown, command: Command) =>
      withRuntime(command, async (runtime) => {
        const spinner = ora("Clearing Zepto cart").start();
        const cart = await new ZeptoService(runtime).cart.clear();
        spinner.succeed("Cart cleared.");
        printCart(cart);
      })
    );

}
