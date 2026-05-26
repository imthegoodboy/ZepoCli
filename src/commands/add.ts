import chalk from "chalk";
import ora from "ora";
import type { Command } from "commander";

import { ZeptoService } from "../services/zepto.js";
import { printCart } from "../utils/output.js";
import { joinQuery, withRuntime } from "./shared.js";

export function registerAddCommand(program: Command): void {
  program
    .command("add")
    .description("Search and add a product to the Zepto cart")
    .argument("<query...>", "product query")
    .option("-q, --quantity <number>", "quantity to add", "1")
    .option("--choose", "pick from matched products interactively")
    .action((queryParts: string[], options: { quantity: string; choose?: boolean }, command: Command) =>
      withRuntime(command, async (runtime) => {
        const query = joinQuery(queryParts);
        const spinner = options.choose ? undefined : ora(`Adding "${query}"`).start();
        const result = await new ZeptoService(runtime).cart.add(query, {
          quantity: options.quantity,
          choose: options.choose
        });
        spinner?.succeed(`Added ${result.product.name}.`);

        if (!spinner) {
          console.log(chalk.green(`Added ${result.product.name}.`));
        }

        if (result.cart) {
          printCart(result.cart);
        }
      })
    );
}
