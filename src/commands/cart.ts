import type { Command } from "commander";

import { printCart } from "../utils/output.js";
import { joinQuery, wantsJson, withCommandSpinner, withRuntime } from "./shared.js";

export function registerCartCommands(program: Command): void {
  program
    .command("cart")
    .description("Show Zepto cart")
    .option("--remove-limit-items", "click Zepto's Remove Items action for item-limit warnings before reading")
    .option("--json", "print machine-readable JSON")
    .action((options: { json?: boolean; removeLimitItems?: boolean }, command: Command) =>
      withRuntime(command, async (runtime) => {
        const { ZeptoService } = await import("../services/zepto.js");
        const json = wantsJson(command, options);
        const service = new ZeptoService(runtime).cart;
        const readOptions = { removeLimitItems: Boolean(options.removeLimitItems) };
        const cart = json
          ? await service.read(readOptions)
          : await withCommandSpinner(
              options.removeLimitItems ? "Resolving Zepto cart limit warning" : "Reading Zepto cart",
              "Cart loaded.",
              () => service.read(readOptions)
            );
        printCart(cart, json);
      })
    );

  program
    .command("remove")
    .description("Remove a matching item from the Zepto cart")
    .argument("<query...>", "cart item query")
    .option("--json", "print machine-readable JSON")
    .action((queryParts: string[], options: { json?: boolean }, command: Command) =>
      withRuntime(command, async (runtime) => {
        const { ZeptoService } = await import("../services/zepto.js");
        const json = wantsJson(command, options);
        const query = joinQuery(queryParts);
        const service = new ZeptoService(runtime).cart;
        const cart = json
          ? await service.remove(query)
          : await withCommandSpinner(`Removing "${query}"`, `Removed matching item for "${query}".`, () =>
              service.remove(query)
            );
        printCart(cart, json);
      })
    );

  program
    .command("clear")
    .description("Remove all detected items from the Zepto cart")
    .option("--json", "print machine-readable JSON")
    .action((options: { json?: boolean }, command: Command) =>
      withRuntime(command, async (runtime) => {
        const { ZeptoService } = await import("../services/zepto.js");
        const json = wantsJson(command, options);
        const service = new ZeptoService(runtime).cart;
        const cart = json
          ? await service.clear()
          : await withCommandSpinner("Clearing Zepto cart", "Cart cleared.", () => service.clear());
        printCart(cart, json);
      })
    );

}
