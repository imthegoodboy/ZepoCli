import Fuse from "fuse.js";
import { select } from "@inquirer/prompts";
import { z } from "zod";

import type { AppRuntime } from "../config/runtime.js";
import type { CartItem, CartSnapshot, Product } from "../types.js";
import { BrowserAutomation } from "../automation/browser.js";
import { clearCart, readCart, removeCartItem } from "../automation/cart.js";
import { clickProductAdd, increaseProductQuantity, searchProducts } from "../automation/search.js";
import { UserFacingError, requireNonEmpty } from "../utils/errors.js";
import { normalizeText } from "../utils/format.js";

const QuantitySchema = z.coerce.number().int().min(1).max(50);

export interface AddOptions {
  quantity?: unknown;
  choose?: boolean;
}

export interface AddResult {
  product: Product;
  cart: CartSnapshot;
}

export class CartService {
  private readonly browser: BrowserAutomation;

  constructor(private readonly runtime: AppRuntime) {
    this.browser = new BrowserAutomation(runtime);
  }

  async add(query: string, options: AddOptions = {}): Promise<AddResult> {
    const cleanQuery = requireNonEmpty(query, "Product query");
    const quantity = parseAddQuantity(options.quantity ?? 1);

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
      const cart = await readCart(page);
      assertCartContainsProduct(cart, product, quantity);
      this.runtime.sqlite.saveCartSnapshot(cart);

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

export function parseAddQuantity(quantityInput: unknown): number {
  const result = QuantitySchema.safeParse(quantityInput);
  if (result.success) {
    return result.data;
  }

  throw new UserFacingError("Quantity must be an integer from 1 to 50.", {
    hint: "Use a value like `zepo add milk --quantity 2`."
  });
}

export function assertCartContainsProduct(cart: CartSnapshot, product: Product, minimumQuantity = 1): void {
  if (cart.items.length === 0) {
    throw new UserFacingError(`Zepto cart was opened after adding ${product.name}, but no readable cart items were detected.`, {
      hint: "Rerun with `--visible --debug` to inspect Zepto's cart page instead of treating the add as successful."
    });
  }

  const matchingItem = findMatchingCartItem(cart, product);
  if (matchingItem) {
    assertCartQuantity(matchingItem, product, minimumQuantity);
    return;
  }

  throw new UserFacingError(`Zepto cart did not show an item matching ${product.name} after ADD.`, {
    hint: "The page may have changed or the item may be unavailable. Rerun with `--visible --debug` before retrying checkout."
  });
}

function findMatchingCartItem(cart: CartSnapshot, product: Product): CartItem | undefined {
  const productName = normalizeText(product.name).toLowerCase();
  const directMatch = cart.items.find((item) => {
    const itemName = normalizeText(item.name).toLowerCase();
    return itemName.includes(productName) || productName.includes(itemName);
  });

  if (directMatch) {
    return directMatch;
  }

  const fuse = new Fuse(cart.items, {
    keys: ["name"],
    threshold: 0.55,
    ignoreLocation: true
  });

  return fuse.search(product.name)[0]?.item;
}

function assertCartQuantity(item: CartItem, product: Product, minimumQuantity: number): void {
  if (minimumQuantity <= 1) {
    return;
  }

  const quantity = item.quantity ? Number.parseInt(item.quantity, 10) : undefined;
  if (!quantity) {
    throw new UserFacingError(`Zepto cart did not expose the quantity for ${product.name} after requesting ${minimumQuantity}.`, {
      hint: "Rerun with `--visible --debug` to inspect Zepto's cart quantity controls before retrying checkout."
    });
  }

  if (quantity < minimumQuantity) {
    throw new UserFacingError(`Zepto cart shows quantity ${quantity} for ${product.name}, below requested ${minimumQuantity}.`, {
      hint: "Open `zepo cart` to inspect the item, then retry with a lower quantity if Zepto limits this product."
    });
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
