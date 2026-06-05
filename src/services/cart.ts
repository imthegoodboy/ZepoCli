import Fuse from "fuse.js";
import { select } from "@inquirer/prompts";

import type { AppRuntime } from "../config/runtime.js";
import type { CartItem, CartSnapshot, Product } from "../types.js";
import { BrowserAutomation, gotoZepto } from "../automation/browser.js";
import { clearCart, readCart, removeCartItem } from "../automation/cart.js";
import { clickProductAdd, increaseProductQuantity, searchProducts, waitForProductAddSettled } from "../automation/search.js";
import { UserFacingError, requireNonEmpty } from "../utils/errors.js";
import { requireInteractiveInput } from "../utils/interactive.js";
import {
  normalizeProductMatchText,
  queryHasSpecificSizeTerm,
  textMatchesProductQuery
} from "../utils/product-matching.js";
import { promptContext } from "../utils/prompts.js";
import { parseDecimalInteger } from "../utils/validation.js";

const MAX_ADD_QUANTITY = 12;
const EMPTY_CART_REREAD_DELAY_MS = 5_000;
const EMPTY_CART_READ_REREAD_ATTEMPTS = 6;
const POST_ADD_EMPTY_CART_REREAD_ATTEMPTS = 6;
const GENERIC_AUTO_ADD_TERMS = new Set([
  "fresh",
  "milk",
  "pouch",
  "pack",
  "packet",
  "toned",
  "standardized",
  "standardised",
  "homogenised",
  "homogenized"
]);

export interface AddOptions {
  quantity?: unknown;
  choose?: boolean;
  removeLimitItems?: boolean;
}

export interface AddResult {
  product: Product;
  cart: CartSnapshot;
}

export interface CartReadOptions {
  removeLimitItems?: boolean;
}

export class CartService {
  private readonly browser: BrowserAutomation;

  constructor(private readonly runtime: AppRuntime) {
    this.browser = new BrowserAutomation(runtime);
  }

  async add(query: string, options: AddOptions = {}): Promise<AddResult> {
    const cleanQuery = requireNonEmpty(query, "Product query");
    const quantity = parseAddQuantity(options.quantity ?? 1);
    this.runtime.logger.debug(
      {
        choose: options.choose === true,
        quantity,
        removeLimitItems: options.removeLimitItems === true
      },
      "cart add command starting"
    );
    if (options.choose) {
      requireInteractiveInput(
        this.runtime,
        "Interactive product selection requires input.",
        "Rerun without `--no-input`, or remove `--choose` and provide a more specific product query."
      );
    }

    return this.browser.withPage({ captureFailures: false, requireSession: true }, async (page) => {
      this.runtime.logger.debug("cart add search starting");
      const products = await searchProducts(page, cleanQuery, options.choose ? 10 : 5);
      this.runtime.logger.debug({ productCount: products.length }, "cart add search finished");
      if (products.length === 0) {
        throw new UserFacingError(`No Zepto products found for "${cleanQuery}".`, {
          code: "product_not_found",
          hint: "Try a more specific product name or set a delivery location with `zepo --visible address add`."
        });
      }

      const addableProducts = requireAddableProducts(products, cleanQuery);
      const product = options.choose ? await chooseProduct(addableProducts) : requireBestMatch(addableProducts, cleanQuery);
      this.runtime.logger.debug({ addableProductCount: addableProducts.length }, "cart add product click starting");
      await clickProductAdd(page, product);
      this.runtime.logger.debug("cart add product click finished");
      this.runtime.logger.debug("cart add settle starting");
      await waitForProductAddSettled(page);
      this.runtime.logger.debug("cart add settle finished");
      this.runtime.logger.debug({ quantity }, "cart add quantity increase starting");
      await increaseProductQuantity(page, product, quantity);
      this.runtime.logger.debug("cart add quantity increase finished");
      this.runtime.logger.debug("cart add verification read starting");
      const cart = await readCartWithEmptyRecovery(page, POST_ADD_EMPTY_CART_REREAD_ATTEMPTS, {
        removeLimitItems: options.removeLimitItems === true
      });
      this.runtime.logger.debug(
        {
          itemCount: cart.items.length,
          hasTotal: cart.total !== undefined
        },
        "cart add verification read finished"
      );
      assertCartContainsProduct(cart, product, quantity);
      this.runtime.sqlite.saveCartSnapshot(cart);

      return {
        product,
        cart
      };
    });
  }

  async read(options: CartReadOptions = {}): Promise<CartSnapshot> {
    this.runtime.logger.debug(
      { removeLimitItems: options.removeLimitItems === true },
      "cart read command starting"
    );
    const snapshot = await this.browser.withPage({ captureFailures: false, requireSession: true }, (page) =>
      readCartWithEmptyRecovery(page, EMPTY_CART_READ_REREAD_ATTEMPTS, options)
    );
    this.runtime.logger.debug(
      {
        itemCount: snapshot.items.length,
        hasTotal: snapshot.total !== undefined
      },
      "cart read command finished"
    );
    this.runtime.sqlite.saveCartSnapshot(snapshot);
    return snapshot;
  }

  async remove(query: string): Promise<CartSnapshot> {
    const cleanQuery = requireNonEmpty(query, "Cart item query");
    const snapshot = await this.browser.withPage({ captureFailures: false, requireSession: true }, (page) =>
      removeCartItem(page, cleanQuery)
    );
    this.runtime.sqlite.saveCartSnapshot(snapshot);
    return snapshot;
  }

  async clear(): Promise<CartSnapshot> {
    const snapshot = await this.browser.withPage({ captureFailures: false, requireSession: true }, (page) => clearCart(page));
    this.runtime.sqlite.saveCartSnapshot(snapshot);
    return snapshot;
  }
}

async function readCartWithEmptyRecovery(
  page: Parameters<typeof readCart>[0],
  attempts: number,
  options: CartReadOptions = {}
): Promise<CartSnapshot> {
  let cart = await readCart(page, options);
  for (let attempt = 1; cart.items.length === 0 && attempt < attempts; attempt += 1) {
    await page.waitForTimeout(EMPTY_CART_REREAD_DELAY_MS);
    await gotoZepto(page);
    cart = await readCart(page, options);
  }

  return cart;
}

export function parseAddQuantity(quantityInput: unknown): number {
  const quantity = parseDecimalInteger(quantityInput);
  if (quantity !== undefined && quantity >= 1 && quantity <= MAX_ADD_QUANTITY) {
    return quantity;
  }

  throw new UserFacingError(`Quantity must be an integer from 1 to ${MAX_ADD_QUANTITY}.`, {
    code: "invalid_input",
    hint: "Use a value like `zepo add milk --quantity 2`."
  });
}

export function assertCartContainsProduct(cart: CartSnapshot, product: Product, minimumQuantity = 1): void {
  if (cart.items.length === 0) {
    throw new UserFacingError(`Zepto cart was opened after adding ${product.name}, but no readable cart items were detected.`, {
      code: "cart_add_unverified",
      hint: "Rerun with `--visible` to inspect Zepto's cart page instead of treating the add as successful."
    });
  }

  const matchingItem = findMatchingCartItem(cart, product);
  if (matchingItem) {
    assertCartQuantity(matchingItem, product, minimumQuantity);
    return;
  }

  throw new UserFacingError(`Zepto cart did not show an item matching ${product.name} after ADD.`, {
    code: "cart_add_unverified",
    hint: "The page may have changed or the item may be unavailable. Rerun with `--visible` before retrying checkout."
  });
}

function findMatchingCartItem(cart: CartSnapshot, product: Product): CartItem | undefined {
  const productText = productSearchText(product);
  const directMatch = cart.items.find((item) => textMatchesProductQuery(cartItemSearchText(item), productText));
  if (directMatch) {
    return directMatch;
  }

  if (product.unit) {
    return undefined;
  }

  const fuse = new Fuse(cart.items, {
    keys: ["name"],
    threshold: 0.55,
    ignoreLocation: true
  });

  return fuse.search(product.name)[0]?.item;
}

function cartItemSearchText(item: CartItem): string {
  return [item.name, item.unit].filter(Boolean).join(" ");
}

function assertCartQuantity(item: CartItem, product: Product, minimumQuantity: number): void {
  if (minimumQuantity <= 1) {
    return;
  }

  const quantity = item.quantity ? Number.parseInt(item.quantity, 10) : undefined;
  if (!quantity) {
    throw new UserFacingError(`Zepto cart did not expose the quantity for ${product.name} after requesting ${minimumQuantity}.`, {
      code: "cart_quantity_unverified",
      hint: "Rerun with `--visible` to inspect Zepto's cart quantity controls before retrying checkout."
    });
  }

  if (quantity < minimumQuantity) {
    throw new UserFacingError(`Zepto cart shows quantity ${quantity} for ${product.name}, below requested ${minimumQuantity}.`, {
      code: "cart_quantity_unverified",
      hint: "Open `zepo cart` to inspect the item, then retry with a lower quantity if Zepto limits this product."
    });
  }
}

export function requireBestMatch(products: Product[], query: string): Product {
  const lexicalMatch = products.find((product) => textMatchesProductQuery(productSearchText(product), query));
  if (lexicalMatch) {
    return lexicalMatch;
  }

  if (queryHasSpecificSizeTerm(query)) {
    throw new UserFacingError(`No confident Zepto product match was found for "${query}".`, {
      code: "product_match_unconfirmed",
      hint: "Run `zepo add --choose <query>` to pick from the visible search results."
    });
  }

  const fuse = new Fuse(products, {
    keys: ["name", "unit"],
    threshold: 0.45,
    ignoreLocation: true
  });
  const match = fuse.search(query)[0]?.item;
  if (match && hasDistinctiveQueryTermOverlap(match, query)) {
    return match;
  }

  throw new UserFacingError(`No confident Zepto product match was found for "${query}".`, {
    code: "product_match_unconfirmed",
    hint: "Run `zepo add --choose <query>` to pick from the visible search results."
  });
}

function productSearchText(product: Product): string {
  return [product.name, product.unit].filter(Boolean).join(" ");
}

function hasDistinctiveQueryTermOverlap(product: Product, query: string): boolean {
  const distinctiveTerms = distinctiveAutoAddTerms(query);
  if (distinctiveTerms.length === 0) {
    return true;
  }

  const productText = productSearchText(product);
  return distinctiveTerms.some((term) => textMatchesProductQuery(productText, term));
}

function distinctiveAutoAddTerms(query: string): string[] {
  return normalizeProductMatchText(query)
    .split(/[^a-z0-9.]+/i)
    .filter((term) => /^[a-z][a-z0-9]{2,}$/i.test(term))
    .filter((term) => !GENERIC_AUTO_ADD_TERMS.has(term));
}

export function requireAddableProducts(products: Product[], query: string): Product[] {
  const addableProducts = products.filter((product) => product.automationId !== undefined);
  if (addableProducts.length > 0) {
    return addableProducts;
  }

  throw new UserFacingError(`Zepto did not expose ADD buttons for products matching "${query}".`, {
    code: "product_not_addable",
    hint: "Rerun with `--visible` to inspect the search results, or try a more specific product query."
  });
}

async function chooseProduct(products: Product[]): Promise<Product> {
  return select(
    {
      message: "Select product",
      choices: products.map((product) => ({
        name: `${product.name}${product.unit ? ` - ${product.unit}` : ""}${product.price ? ` (${product.price})` : ""}`,
        value: product
      }))
    },
    promptContext()
  );
}
