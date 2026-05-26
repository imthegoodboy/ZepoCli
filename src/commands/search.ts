import type { Command } from "commander";

import { DEFAULT_PRODUCT_LIMIT } from "../config/constants.js";
import { ZeptoService } from "../services/zepto.js";
import { printProducts } from "../utils/output.js";
import { joinQuery, withCommandSpinner, withRuntime } from "./shared.js";

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
        const service = new ZeptoService(runtime).search;
        const products = options.json
          ? await service.search(query, options.limit)
          : await withCommandSpinner(
              `Searching Zepto for "${query}"`,
              (items) => `Found ${items.length} product${items.length === 1 ? "" : "s"}.`,
              () => service.search(query, options.limit)
            );
        printProducts(products, options.json);
      })
    );
}
