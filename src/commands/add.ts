import chalk from "chalk";
import type { Command } from "commander";

import { printAddResult, printCart } from "../utils/output.js";
import { joinQuery, wantsJson, withCommandSpinner, withRuntime } from "./shared.js";

export function registerAddCommand(program: Command): void {
  program
    .command("add")
    .description("Search and add a product to the Zepto cart")
    .argument("<query...>", "product query")
    .option("-q, --quantity <number>", "quantity to add, maximum 12", "1")
    .option("--choose", "pick from matched products interactively")
    .option("--json", "print machine-readable JSON")
    .action((queryParts: string[], options: { quantity: string; choose?: boolean; json?: boolean }, command: Command) =>
      withRuntime(command, async (runtime) => {
        const { ZeptoService } = await import("../services/zepto.js");
        const json = wantsJson(command, options);
        const query = joinQuery(queryParts);
        const service = new ZeptoService(runtime).cart;
        const add = () =>
          service.add(query, {
            quantity: options.quantity,
            choose: options.choose
          });
        if (json) {
          printAddResult(await add());
          return;
        }

        const result = options.choose
          ? await add()
          : await withCommandSpinner(`Adding "${query}"`, (item) => `Added ${item.product.name}.`, add);

        if (options.choose) {
          console.log(chalk.green(`Added ${result.product.name}.`));
        }

        printCart(result.cart);
      })
    );
}
