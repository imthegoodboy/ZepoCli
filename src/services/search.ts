import { DEFAULT_PRODUCT_LIMIT } from "../config/constants.js";
import type { AppRuntime } from "../config/runtime.js";
import type { Product } from "../types.js";
import { UserFacingError, requireNonEmpty } from "../utils/errors.js";
import { parseDecimalInteger } from "../utils/validation.js";
import { BrowserAutomation } from "../automation/browser.js";
import { searchProducts } from "../automation/search.js";

const MIN_SEARCH_LIMIT = 1;
const MAX_SEARCH_LIMIT = 50;

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
  const limit = parseDecimalInteger(limitInput);
  if (limit !== undefined && limit >= MIN_SEARCH_LIMIT && limit <= MAX_SEARCH_LIMIT) {
    return limit;
  }

  throw new UserFacingError("Search limit must be an integer from 1 to 50.", {
    code: "invalid_input",
    hint: "Use a value like `zepo search milk --limit 10`."
  });
}
