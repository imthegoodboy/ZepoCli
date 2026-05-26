import { z } from "zod";

import { DEFAULT_PRODUCT_LIMIT } from "../config/constants.js";
import type { AppRuntime } from "../config/runtime.js";
import type { Product } from "../types.js";
import { requireNonEmpty } from "../utils/errors.js";
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
    const limit = LimitSchema.parse(limitInput);

    const products = await this.browser.withPage({ requireSession: false }, (page) =>
      searchProducts(page, cleanQuery, limit)
    );

    this.runtime.sqlite.recordSearch(cleanQuery, products.length);
    return products;
  }
}
