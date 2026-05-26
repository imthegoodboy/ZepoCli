import ora from "ora";
import type { Command } from "commander";

import { DEFAULT_PRODUCT_LIMIT } from "../config/constants.js";
import { ZeptoService } from "../services/zepto.js";
import { printProducts } from "../utils/output.js";
import { joinQuery, withRuntime } from "./shared.js";

export function registerSearchCommand(program: Command): void {
  program
    .command("search")
    .description("Search Zepto products")
    .argument("<query...>", "product search query")
    .option("-l, --limit <number>", "maximum products to show", String(DEFAULT_PRODUCT_LIMIT))
    .option("--json", "print machine-readable JSON")
    .action((queryParts: string[], options: { limit: string; json?: boolean }, command: Command) =>
      withRuntime(command, async (runtime) => {
        const query = joinQuery(queryParts);
        const spinner = options.json ? undefined : ora(`Searching Zepto for "${query}"`).start();
        const products = await new ZeptoService(runtime).search.search(query, options.limit);
        spinner?.succeed(`Found ${products.length} product${products.length === 1 ? "" : "s"}.`);
        printProducts(products, options.json);
      })
    );
}
