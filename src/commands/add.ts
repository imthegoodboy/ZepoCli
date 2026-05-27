import chalk from "chalk";
import type { Command } from "commander";

import { ZeptoService } from "../services/zepto.js";
import { printCart, printJson } from "../utils/output.js";
import { joinQuery, withCommandSpinner, withRuntime } from "./shared.js";

export function registerAddCommand(program: Command): void {
  program
    .command("add")
    .description("Search and add a product to the Zepto cart")
    .argument("<query...>", "product query")
    .option("-q, --quantity <number>", "quantity to add", "1")
    .option("--choose", "pick from matched products interactively")
    .option("--json", "print machine-readable JSON")
    .action((queryParts: string[], options: { quantity: string; choose?: boolean; json?: boolean }, command: Command) =>
      withRuntime(command, async (runtime) => {
        const query = joinQuery(queryParts);
        const service = new ZeptoService(runtime).cart;
        const add = () =>
          service.add(query, {
            quantity: options.quantity,
            choose: options.choose
          });
        if (options.json) {
          printJson(await add());
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
