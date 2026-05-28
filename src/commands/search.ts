import type { Command } from "commander";

import { DEFAULT_PRODUCT_LIMIT } from "../config/constants.js";
import { printProducts } from "../utils/output.js";
import { joinQuery, wantsJson, withCommandSpinner, withRuntime } from "./shared.js";

export function registerSearchCommand(program: Command): void {
  program
    .command("search")
    .description("Search Zepto products")
    .argument("<query...>", "product search query")
    .option("-l, --limit <number>", "maximum products to show", String(DEFAULT_PRODUCT_LIMIT))
    .option("--json", "print machine-readable JSON")
    .action((queryParts: string[], options: { limit: string; json?: boolean }, command: Command) =>
      withRuntime(command, async (runtime) => {
        const { ZeptoService } = await import("../services/zepto.js");
        const json = wantsJson(command, options);
        const query = joinQuery(queryParts);
        const service = new ZeptoService(runtime).search;
        const products = json
          ? await service.search(query, options.limit)
          : await withCommandSpinner(
              `Searching Zepto for "${query}"`,
              (items) => `Found ${items.length} product${items.length === 1 ? "" : "s"}.`,
              () => service.search(query, options.limit)
            );
        printProducts(products, json);
      })
    );
}
