import ora from "ora";
import type { Command } from "commander";

import { ZeptoService } from "../services/zepto.js";
import { UserFacingError } from "../utils/errors.js";
import { printOrders } from "../utils/output.js";
import { withRuntime } from "./shared.js";

export function registerOrderCommands(program: Command): void {
  program
    .command("track")
    .description("Show latest Zepto order status")
    .option("--json", "print machine-readable JSON")
    .action((options: { json?: boolean }, command: Command) =>
      withRuntime(command, async (runtime) => {
        const spinner = options.json ? undefined : ora("Reading latest Zepto order").start();
        const orders = await new ZeptoService(runtime).orders.track();
        spinner?.succeed("Latest order loaded.");
        printOrders(orders, options.json);
      })
    );

  program
    .command("history")
    .description("Show Zepto order history")
    .option("--json", "print machine-readable JSON")
    .action((options: { json?: boolean }, command: Command) =>
      withRuntime(command, async (runtime) => {
        const spinner = options.json ? undefined : ora("Reading Zepto order history").start();
        const orders = await new ZeptoService(runtime).orders.history();
        spinner?.succeed(`Found ${orders.length} order${orders.length === 1 ? "" : "s"}.`);
        printOrders(orders, options.json);
      })
    );

  program
    .command("reorder")
    .description("Reorder from Zepto order history")
    .argument("[target]", "currently supports: last", "last")
    .action((target: string, _options: unknown, command: Command) =>
      withRuntime(command, async (runtime) => {
        if (target !== "last") {
          throw new UserFacingError("Only `zepo reorder last` is supported.");
        }

        const spinner = ora("Opening latest order reorder action").start();
        await new ZeptoService(runtime).orders.reorderLast();
        spinner.succeed("Reorder action completed.");
      })
    );
}
