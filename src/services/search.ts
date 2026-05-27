import { z } from "zod";

import { DEFAULT_PRODUCT_LIMIT } from "../config/constants.js";
import type { AppRuntime } from "../config/runtime.js";
import type { Product } from "../types.js";
import { UserFacingError, requireNonEmpty } from "../utils/errors.js";
import { BrowserAutomation } from "../automation/browser.js";
import { searchProducts } from "../automation/search.js";

const LimitSchema = z.coerce.number().int().min(1).max(50);

export class SearchService {
  private readonly browser: BrowserAutomation;

  constructor(private readonly runtime: AppRuntime) {
    this.browser = new BrowserAutomation(runtime);
  }

  async search(query: string, limitInput: unknown = DEFAULT_PRODUCT_LIMIT): Promise<Product[]> {
    const cleanQuery = requireNonEmpty(query, "Search query");
    const limit = parseSearchLimit(limitInput);

    const products = await this.browser.withPage({ requireSession: false }, (page) =>
      searchProducts(page, cleanQuery, limit)
    );

    this.runtime.sqlite.recordSearch(cleanQuery, products.length);
    return products;
  }
}

export function parseSearchLimit(limitInput: unknown): number {
  const result = LimitSchema.safeParse(limitInput);
  if (result.success) {
    return result.data;
  }

  throw new UserFacingError("Search limit must be an integer from 1 to 50.", {
    hint: "Use a value like `zepo search milk --limit 10`."
  });
}
