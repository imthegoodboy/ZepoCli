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
    .option("--json", "print machine-readable JSON")
    .action((queryParts: string[], options: { json?: boolean }, command: Command) =>
      withRuntime(command, async (runtime) => {
        const query = joinQuery(queryParts);
        const service = new ZeptoService(runtime).cart;
        const cart = options.json
          ? await service.remove(query)
          : await withCommandSpinner(`Removing "${query}"`, `Removed matching item for "${query}".`, () =>
              service.remove(query)
            );
        printCart(cart, options.json);
      })
    );

  program
    .command("clear")
    .description("Remove all detected items from the Zepto cart")
    .option("--json", "print machine-readable JSON")
    .action((options: { json?: boolean }, command: Command) =>
      withRuntime(command, async (runtime) => {
        const service = new ZeptoService(runtime).cart;
        const cart = options.json
          ? await service.clear()
          : await withCommandSpinner("Clearing Zepto cart", "Cart cleared.", () => service.clear());
        printCart(cart, options.json);
      })
    );

}
