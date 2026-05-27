import type { Page } from "playwright";

import type { CartSnapshot } from "../types.js";
import { UserFacingError } from "../utils/errors.js";
import { extractPrices, normalizeText } from "../utils/format.js";
import { parseCartItemsFromText } from "./extract.js";
import { clickFirstText, gotoZepto } from "./browser.js";

export async function openCart(page: Page): Promise<void> {
  await gotoZepto(page, "/cart");

  const bodyText = await page.locator("body").innerText().catch(() => "");
  if (/cart|checkout|view bill|to pay/i.test(bodyText)) {
    return;
  }

  await gotoZepto(page);
  const opened = await clickFirstText(page, [/cart/i, /view cart/i, /checkout/i]);
  if (!opened) {
    throw new UserFacingError("Could not open the Zepto cart.", {
      hint: "Log in and add an item first, then rerun the command."
    });
  }

  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
}

export async function readCart(page: Page): Promise<CartSnapshot> {
  await openCart(page);

  const rawText = await page.locator("body").innerText();
  return {
    items: parseCartItemsFromText(rawText),
    total: extractCartTotal(rawText),
    rawText
  };
}

export async function removeCartItem(page: Page, query: string): Promise<CartSnapshot> {
  await openCart(page);

  let removed = false;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const removeId = await findRemoveButtonId(page, query);
    if (removeId === undefined) {
      break;
    }

    const button = page.locator(`[data-zepo-remove-id="${removeId}"]`).first();
    await button.click();
    removed = true;
    await page.waitForTimeout(700);
  }

  if (!removed) {
    throw new UserFacingError(`Could not find a removable cart item matching "${query}".`);
  }

  const cart = await readCart(page);
  if (cartHasMatchingItem(cart, query)) {
    throw new UserFacingError(`Zepto still shows a cart item matching "${query}" after remove.`, {
      hint: "Rerun with `--visible --debug` to inspect the cart controls before retrying checkout."
    });
  }

  return cart;
}

export async function clearCart(page: Page): Promise<CartSnapshot> {
  await openCart(page);

  let removedCount = 0;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const removeId = await findRemoveButtonId(page);
    if (removeId === undefined) {
      break;
    }

    await page.locator(`[data-zepo-remove-id="${removeId}"]`).first().click();
    removedCount += 1;
    await page.waitForTimeout(500);
  }

  const cart = await readCart(page);
  if (cart.items.length > 0) {
    throw new UserFacingError("Could not clear all detected Zepto cart items.", {
      hint: "Rerun with `--visible --debug` to inspect Zepto's cart controls, or remove the remaining items in the browser."
    });
  }

  return cart;
}

export function cartHasMatchingItem(cart: CartSnapshot, query: string): boolean {
  const queryText = normalizeText(query).toLowerCase();
  if (!queryText) {
    return false;
  }

  return cart.items.some((item) => {
    const itemText = normalizeText([item.name, item.unit].filter(Boolean).join(" ")).toLowerCase();
    return itemText.includes(queryText) || queryText.includes(itemText);
  });
}

async function findRemoveButtonId(page: Page, query?: string): Promise<number | undefined> {
  return page.evaluate((itemQuery) => {
    const normalize = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();
    const queryText = itemQuery ? normalize(itemQuery) : undefined;
    const isRemoveButton = (element: Element) => {
      const text = normalize(element.textContent ?? "");
      const aria = normalize(element.getAttribute("aria-label") ?? "");
      return (
        text === "-" ||
        text === "−" ||
        text === "remove" ||
        text === "delete" ||
        aria.includes("remove") ||
        aria.includes("delete") ||
        aria.includes("decrease")
      );
    };
    const cardFor = (element: Element) => {
      let current: Element | null = element;
      for (let depth = 0; current && depth < 8; depth += 1) {
        const text = current.textContent ?? "";
        if (text.includes("₹") && text.length < 1500) {
          return current;
        }
        current = current.parentElement;
      }
      return element;
    };

    const candidates = Array.from(document.querySelectorAll("button, [role='button']")).filter(isRemoveButton);
    for (const [index, button] of candidates.entries()) {
      const cardText = normalize(cardFor(button).textContent ?? "");
      if (!queryText || cardText.includes(queryText)) {
        button.setAttribute("data-zepo-remove-id", String(index));
        return index;
      }
    }

    return undefined;
  }, query);
}

function extractCartTotal(rawText: string): string | undefined {
  const lines = rawText.split(/\r?\n/).map((line) => line.trim());
  for (const line of lines) {
    if (/to pay|grand total|total/i.test(line)) {
      const prices = extractPrices(line);
      if (prices.length > 0) {
        return prices.at(-1);
      }
    }
  }

  return extractPrices(rawText).at(-1);
}
