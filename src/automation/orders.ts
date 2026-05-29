import type { Locator, Page } from "playwright";

import type { CartSnapshot, OrderSnapshot } from "../types.js";
import { UserFacingError } from "../utils/errors.js";
import { parseOrdersFromText } from "./extract.js";
import { assertNoAccessChallenge, gotoZepto } from "./browser.js";
import { isDisabledControl, readControlLabels } from "./control-state.js";
import { readCart } from "./cart.js";

export const ORDERS_OPEN_CLICK_LABELS = [/^my orders$/i, /^orders$/i, /^order history$/i, /^past orders$/i] as const;
export const ACCOUNT_MENU_CLICK_LABELS = [/^account$/i, /^profile$/i] as const;
export const REORDER_ACTION_CLICK_LABELS = [/^reorder$/i, /^order again$/i, /^repeat order$/i] as const;

export async function openOrders(page: Page): Promise<void> {
  await gotoZepto(page, "/orders");
  let bodyText = await page.locator("body").innerText().catch(() => "");
  if (isOrdersPageText(bodyText)) {
    return;
  }

  await gotoZepto(page);
  let opened = await clickOrdersNavigationControl(page);
  if (!opened) {
    const openedAccountMenu = await clickAccountMenuControl(page);
    if (openedAccountMenu) {
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
      await assertNoAccessChallenge(page);
      opened = await clickOrdersNavigationControl(page);
    }
  }

  if (!opened) {
    throw new UserFacingError("Could not find Zepto order history navigation.", {
      code: "orders_navigation_unavailable",
      hint: "Make sure you are logged in, then check the browser manually with `zepo login`."
    });
  }

  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  await assertNoAccessChallenge(page);
  bodyText = await page.locator("body").innerText().catch(() => "");

  if (!isOrdersPageText(bodyText)) {
    throw new UserFacingError("Could not open Zepto orders.", {
      code: "orders_unavailable",
      hint: "Make sure you are logged in, then check the browser manually with `zepo login`."
    });
  }
}

export async function clickOrdersNavigationControl(page: Page): Promise<boolean> {
  return clickLabeledControl(page, ORDERS_OPEN_CLICK_LABELS, isOrdersOpenClickText, isUnsafeOrdersOpenClickText);
}

export async function clickAccountMenuControl(page: Page): Promise<boolean> {
  return clickLabeledControl(page, ACCOUNT_MENU_CLICK_LABELS, isAccountMenuClickText, isUnsafeAccountMenuClickText);
}

async function clickLabeledControl(
  page: Page,
  labels: readonly RegExp[],
  isSafeText: (text: string) => boolean,
  isUnsafeText: (text: string) => boolean
): Promise<boolean> {
  const controls = page.locator("button, [role='button'], a");
  for (const label of labels) {
    const candidates = [
      page.getByRole("button", { name: label }).first(),
      page.getByRole("link", { name: label }).first(),
      controls.filter({ hasText: label }).first()
    ];

    for (const candidate of candidates) {
      if (await clickSafeLabeledControl(candidate, isSafeText, isUnsafeText)) {
        return true;
      }
    }
  }

  return false;
}

async function clickSafeLabeledControl(
  locator: Locator,
  isSafeText: (text: string) => boolean,
  isUnsafeText: (text: string) => boolean
): Promise<boolean> {
  if (!(await locator.isVisible().catch(() => false))) {
    return false;
  }

  const labels = await readControlLabels(locator);
  if (labels.some(isUnsafeText)) {
    return false;
  }

  if (!labels.some(isSafeText)) {
    return false;
  }

  if (await isDisabledControl(locator)) {
    return false;
  }

  await locator.click();
  return true;
}

export async function readOrders(page: Page): Promise<OrderSnapshot[]> {
  await openOrders(page);
  const rawText = await page.locator("body").innerText();
  return requireReadableOrders(rawText);
}

export function requireReadableOrders(rawText: string): OrderSnapshot[] {
  const orders = parseOrdersFromText(rawText).slice(0, 20);
  if (orders.length > 0 || isEmptyOrdersText(rawText)) {
    return orders;
  }

  throw new UserFacingError("Zepto orders page did not expose readable order history.", {
    code: "orders_unreadable",
    hint: "Rerun with `--visible` to inspect Zepto's orders page before treating history as empty."
  });
}

export async function reorderLast(page: Page): Promise<CartSnapshot> {
  await openOrders(page);
  const rawText = await page.locator("body").innerText();
  const latestOrder = requireReadableLatestOrderForReorder(rawText);

  const clicked = await clickReorderActionButton(page, latestOrder);
  if (!clicked) {
    throw new UserFacingError("Could not find a reorder action for the latest order.", {
      code: "reorder_unavailable"
    });
  }

  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  await assertNoAccessChallenge(page);
  const cart = await readCart(page);
  return requireReorderCart(cart);
}

export function requireReadableLatestOrderForReorder(rawText: string): OrderSnapshot {
  const latest = requireReadableOrders(rawText)[0];
  if (latest) {
    return latest;
  }

  throw new UserFacingError("No Zepto order was detected to reorder.", {
    code: "order_not_found",
    hint: "Use `zepo history` to inspect detected orders, or complete an order in Zepto before running `zepo reorder last`."
  });
}

export async function clickReorderActionButton(page: Page, latestOrder?: OrderSnapshot): Promise<boolean> {
  const controls = page.locator("button, [role='button'], a");
  for (const label of REORDER_ACTION_CLICK_LABELS) {
    const candidates = [
      page.getByRole("button", { name: label }).first(),
      page.getByRole("link", { name: label }).first(),
      controls.filter({ hasText: label }).first()
    ];

    for (const candidate of candidates) {
      if (await clickSafeReorderControl(candidate, latestOrder)) {
        return true;
      }
    }
  }

  return false;
}

async function clickSafeReorderControl(locator: Locator, latestOrder: OrderSnapshot | undefined): Promise<boolean> {
  if (!(await locator.isVisible().catch(() => false))) {
    return false;
  }

  const labels = await readControlLabels(locator);
  if (labels.some(isUnsafeReorderActionClickText)) {
    return false;
  }

  if (!labels.some(isReorderActionClickText)) {
    return false;
  }

  if (await isDisabledControl(locator)) {
    return false;
  }

  const cardText = await locator.evaluate(readClosestOrderCardText).catch(() => "");
  if (!isReorderControlInReadableOrderText(cardText)) {
    return false;
  }

  if (latestOrder && !isReorderControlInReadableLatestOrderText(cardText, latestOrder)) {
    return false;
  }

  await locator.click();
  return true;
}

export function requireReorderCart(cart: CartSnapshot): CartSnapshot {
  if (cart.items.length > 0) {
    return cart;
  }

  throw new UserFacingError("Zepto did not expose any cart items after the reorder action.", {
    code: "reorder_cart_unreadable",
    hint: "The latest order may be unavailable for reorder, or Zepto changed the reorder flow. Rerun with `--visible`."
  });
}

export function isReorderActionClickText(text: string): boolean {
  return matchesLabel(text, REORDER_ACTION_CLICK_LABELS);
}

export function isOrdersOpenClickText(text: string): boolean {
  return matchesLabel(text, ORDERS_OPEN_CLICK_LABELS);
}

export function isAccountMenuClickText(text: string): boolean {
  return matchesLabel(text, ACCOUNT_MENU_CLICK_LABELS);
}

export function isUnsafeOrdersOpenClickText(text: string): boolean {
  const normalized = normalizeLabelText(text);
  if (!normalized) {
    return false;
  }

  if (/^(go|open|next|continue|submit)$/i.test(normalized)) {
    return true;
  }

  return /\b(account|profile|wallet|cart|my cart|search results?|address|location|deliver(?:ing)? to|checkout|proceed|payment|pay|view bill|bill summary|to pay|track order|reorder|order again|repeat order|cancel order)\b/i.test(
    normalized
  );
}

export function isUnsafeAccountMenuClickText(text: string): boolean {
  const normalized = normalizeLabelText(text);
  if (!normalized) {
    return false;
  }

  if (/^(go|open|menu|next|continue|submit)$/i.test(normalized)) {
    return true;
  }

  return /\b(wallet|cart|my cart|search results?|orders?|order history|track order|reorder|address|location|deliver(?:ing)? to|checkout|proceed|payment|pay|view bill|bill summary|to pay)\b/i.test(
    normalized
  );
}

export function isUnsafeReorderActionClickText(text: string): boolean {
  const normalized = normalizeLabelText(text);
  if (!normalized) {
    return false;
  }

  if (/^(again|repeat|go|open|next|continue|submit)$/i.test(normalized)) {
    return true;
  }

  return /\b(cart|my cart|address|location|deliver(?:ing)? to|checkout|proceed|payment|pay|place order|confirm order|view bill|bill summary|to pay|track order|cancel order)\b/i.test(
    normalized
  );
}

export function isReorderControlInReadableOrderText(text: string): boolean {
  return parseOrdersFromText(text).length > 0;
}

export function isReorderControlInReadableLatestOrderText(text: string, latestOrder: OrderSnapshot): boolean {
  return parseOrdersFromText(text).some((candidate) => orderSnapshotsMatch(candidate, latestOrder));
}

function orderSnapshotsMatch(candidate: OrderSnapshot, expected: OrderSnapshot): boolean {
  if (expected.id) {
    return candidate.id?.toLowerCase() === expected.id.toLowerCase();
  }

  const statusMatches = expected.status !== undefined && candidate.status === expected.status;
  const etaMatches = expected.eta !== undefined && candidate.eta === expected.eta;
  const totalMatches = expected.total !== undefined && candidate.total === expected.total;

  return statusMatches && (etaMatches || totalMatches);
}

function readClosestOrderCardText(element: Element): string {
  let current: Element | null = element;
  for (let depth = 0; current && depth < 8; depth += 1) {
    const text = current instanceof HTMLElement ? current.innerText : current.textContent ?? "";
    const normalized = text.replace(/\s+/g, " ").trim();
    if (normalized.length > 0 && normalized.length < 2500 && /(?:order|eta|total|₹|rs\.?\s?\d)/i.test(normalized)) {
      return normalized;
    }

    current = current.parentElement;
  }

  return "";
}

function matchesLabel(text: string, labels: readonly RegExp[]): boolean {
  const normalized = normalizeLabelText(text);
  if (!normalized) {
    return false;
  }

  return labels.some((label) => label.test(normalized));
}

function normalizeLabelText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function isOrdersPageText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return false;
  }

  if (parseOrdersFromText(normalized).length > 0) {
    return true;
  }

  if (isEmptyOrdersText(normalized)) {
    return true;
  }

  return /\b(my orders|order history|your orders|past orders|no orders|track order|reorder|order again|repeat order)\b/i.test(
    normalized
  );
}

export function isEmptyOrdersText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return false;
  }

  return /\b(no orders|no past orders|no order history|you have not placed any orders|haven't placed any orders|no recent orders)\b/i.test(
    normalized
  );
}
