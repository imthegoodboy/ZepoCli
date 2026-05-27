import type { Command } from "commander";

import { ZeptoService } from "../services/zepto.js";
import { UserFacingError } from "../utils/errors.js";
import { printCart, printOrders } from "../utils/output.js";
import { withCommandSpinner, withRuntime } from "./shared.js";

export function registerOrderCommands(program: Command): void {
  program
    .command("track")
    .description("Show latest Zepto order status")
    .option("--json", "print machine-readable JSON")
    .action((options: { json?: boolean }, command: Command) =>
      withRuntime(command, async (runtime) => {
        const service = new ZeptoService(runtime).orders;
        const orders = options.json
          ? await service.track()
          : await withCommandSpinner("Reading latest Zepto order", "Latest order loaded.", () => service.track());
        printOrders(orders, options.json);
      })
    );

  program
    .command("history")
    .description("Show Zepto order history")
    .option("--json", "print machine-readable JSON")
    .action((options: { json?: boolean }, command: Command) =>
      withRuntime(command, async (runtime) => {
        const service = new ZeptoService(runtime).orders;
        const orders = options.json
          ? await service.history()
          : await withCommandSpinner(
              "Reading Zepto order history",
              (items) => `Found ${items.length} order${items.length === 1 ? "" : "s"}.`,
              () => service.history()
            );
        printOrders(orders, options.json);
      })
    );

  program
    .command("reorder")
    .description("Reorder from Zepto order history")
    .argument("[target]", "currently supports: last", "last")
    .option("--json", "print machine-readable JSON")
    .action((target: string, options: { json?: boolean }, command: Command) =>
      withRuntime(command, async (runtime) => {
        if (target !== "last") {
          throw new UserFacingError("Only `zepo reorder last` is supported.");
        }

        const service = new ZeptoService(runtime).orders;
        const cart = options.json
          ? await service.reorderLast()
          : await withCommandSpinner("Opening latest order reorder action", "Reorder cart loaded.", () =>
              service.reorderLast()
            );
        printCart(cart, options.json);
      })
    );
}
