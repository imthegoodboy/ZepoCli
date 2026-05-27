import type { Page } from "playwright";

import type { CartSnapshot, OrderSnapshot } from "../types.js";
import { UserFacingError } from "../utils/errors.js";
import { parseOrdersFromText } from "./extract.js";
import { clickFirstText, gotoZepto } from "./browser.js";
import { readCart } from "./cart.js";

export async function openOrders(page: Page): Promise<void> {
  await gotoZepto(page, "/orders");
  let bodyText = await page.locator("body").innerText().catch(() => "");
  if (isOrdersPageText(bodyText)) {
    return;
  }

  await gotoZepto(page);
  await clickFirstText(page, [/orders/i, /my orders/i, /profile/i, /account/i]);
  bodyText = await page.locator("body").innerText().catch(() => "");

  if (!isOrdersPageText(bodyText)) {
    throw new UserFacingError("Could not open Zepto orders.", {
      hint: "Make sure you are logged in, then check the browser manually with `zepo login`."
    });
  }
}

export async function readOrders(page: Page): Promise<OrderSnapshot[]> {
  await openOrders(page);
  const rawText = await page.locator("body").innerText();
  return parseOrdersFromText(rawText).slice(0, 20);
}

export async function reorderLast(page: Page): Promise<CartSnapshot> {
  await openOrders(page);

  const clicked = await clickFirstText(page, [/reorder/i, /order again/i, /repeat order/i]);
  if (!clicked) {
    throw new UserFacingError("Could not find a reorder action for the latest order.");
  }

  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  const cart = await readCart(page);
  return requireReorderCart(cart);
}

export function requireReorderCart(cart: CartSnapshot): CartSnapshot {
  if (cart.items.length > 0) {
    return cart;
  }

  throw new UserFacingError("Zepto did not expose any cart items after the reorder action.", {
    hint: "The latest order may be unavailable for reorder, or Zepto changed the reorder flow. Rerun with `--visible --debug`."
  });
}

export function isOrdersPageText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return false;
  }

  if (parseOrdersFromText(normalized).length > 0) {
    return true;
  }

  return /\b(my orders|order history|your orders|past orders|no orders|track order|reorder|order again|repeat order)\b/i.test(
    normalized
  );
}
