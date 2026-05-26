import Fuse from "fuse.js";
import { select } from "@inquirer/prompts";
import { z } from "zod";

import type { AppRuntime } from "../config/runtime.js";
import type { CartSnapshot, Product } from "../types.js";
import { BrowserAutomation } from "../automation/browser.js";
import { clearCart, readCart, removeCartItem } from "../automation/cart.js";
import { clickProductAdd, increaseProductQuantity, searchProducts } from "../automation/search.js";
import { UserFacingError, requireNonEmpty } from "../utils/errors.js";

const QuantitySchema = z.coerce.number().int().min(1).max(50);

export interface AddOptions {
  quantity?: unknown;
  choose?: boolean;
}

export interface AddResult {
  product: Product;
  cart?: CartSnapshot;
}

export class CartService {
  private readonly browser: BrowserAutomation;

  constructor(private readonly runtime: AppRuntime) {
    this.browser = new BrowserAutomation(runtime);
  }

  async add(query: string, options: AddOptions = {}): Promise<AddResult> {
    const cleanQuery = requireNonEmpty(query, "Product query");
    const quantity = QuantitySchema.parse(options.quantity ?? 1);

    return this.browser.withPage({ requireSession: true }, async (page) => {
      const products = await searchProducts(page, cleanQuery, options.choose ? 10 : 5);
      if (products.length === 0) {
        throw new UserFacingError(`No Zepto products found for "${cleanQuery}".`, {
          hint: "Try a more specific product name or set a delivery location with `zepo address add`."
        });
      }

      const product = options.choose ? await chooseProduct(products) : bestMatch(products, cleanQuery);
      await clickProductAdd(page, product);
      await page.waitForTimeout(700);
      await increaseProductQuantity(page, product, quantity);
      const cart = await readCart(page).catch(() => undefined);

      if (cart) {
        this.runtime.sqlite.saveCartSnapshot(cart);
      }

      return {
        product,
        cart
      };
    });
  }

  async read(): Promise<CartSnapshot> {
    const snapshot = await this.browser.withPage({ requireSession: true }, (page) => readCart(page));
    this.runtime.sqlite.saveCartSnapshot(snapshot);
    return snapshot;
  }

  async remove(query: string): Promise<CartSnapshot> {
    const cleanQuery = requireNonEmpty(query, "Cart item query");
    const snapshot = await this.browser.withPage({ requireSession: true }, (page) => removeCartItem(page, cleanQuery));
    this.runtime.sqlite.saveCartSnapshot(snapshot);
    return snapshot;
  }

  async clear(): Promise<CartSnapshot> {
    const snapshot = await this.browser.withPage({ requireSession: true }, (page) => clearCart(page));
    this.runtime.sqlite.saveCartSnapshot(snapshot);
    return snapshot;
  }
}

function bestMatch(products: Product[], query: string): Product {
  const fuse = new Fuse(products, {
    keys: ["name", "unit"],
    threshold: 0.45,
    ignoreLocation: true
  });
  return fuse.search(query)[0]?.item ?? products[0]!;
}

async function chooseProduct(products: Product[]): Promise<Product> {
  return select({
    message: "Select product",
    choices: products.map((product) => ({
      name: `${product.name}${product.unit ? ` - ${product.unit}` : ""}${product.price ? ` (${product.price})` : ""}`,
      value: product
    }))
  });
}
