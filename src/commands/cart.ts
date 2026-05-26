import type { Command } from "commander";

import { ZeptoService } from "../services/zepto.js";
import { printCart } from "../utils/output.js";
import { joinQuery, withCommandSpinner, withRuntime } from "./shared.js";

export function registerCartCommands(program: Command): void {
  program
    .command("cart")
    .description("Show Zepto cart")
    .option("--json", "print machine-readable JSON")
    .action((options: { json?: boolean }, command: Command) =>
      withRuntime(command, async (runtime) => {
        const service = new ZeptoService(runtime).cart;
        const cart = options.json
          ? await service.read()
          : await withCommandSpinner("Reading Zepto cart", "Cart loaded.", () => service.read());
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
        const cart = await withCommandSpinner(`Removing "${query}"`, `Removed matching item for "${query}".`, () =>
          new ZeptoService(runtime).cart.remove(query)
        );
        printCart(cart);
      })
    );

  program
    .command("clear")
    .description("Remove all detected items from the Zepto cart")
    .action((_options: unknown, command: Command) =>
      withRuntime(command, async (runtime) => {
        const cart = await withCommandSpinner("Clearing Zepto cart", "Cart cleared.", () =>
          new ZeptoService(runtime).cart.clear()
        );
        printCart(cart);
      })
    );

}
