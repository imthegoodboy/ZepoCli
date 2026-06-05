import type { Locator, Page } from "playwright";

import { UserFacingError } from "../utils/errors.js";
import { hasStrongCartSurfaceEvidence, parseReadableCartItemsFromText, readCart } from "./cart.js";
import { assertNoAccessChallenge, gotoZepto } from "./browser.js";
import { isDisabledControl, readControlLabels } from "./control-state.js";
import { isFinalCheckoutSurfaceText, isFinalPaymentOrOrderActionText } from "./final-action-labels.js";
import { isOrderActionLabelText } from "./order-action-labels.js";
import {
  isPaymentHandoffSurfaceText,
  isPaymentMethodLabelText,
  isPaymentSelectionPromptText
} from "./payment-labels.js";

export const CHECKOUT_HANDOFF_CLICK_LABELS = [
  /^checkout$/i,
  /^checkout\s+\d+\s*(?:items?|products?)$/i,
  /^proceed\s+to\s+(?:checkout|payment|pay)$/i
] as const;
const CHECKOUT_HANDOFF_CONTROL_SCAN_LIMIT = 8;
const CHECKOUT_HANDOFF_CLICK_TIMEOUT_MS = 10_000;
const CHECKOUT_EMPTY_CART_REREAD_ATTEMPTS = 6;
const CHECKOUT_EMPTY_CART_REREAD_DELAY_MS = 5_000;

export type CheckoutHandoffMode = "checkout_or_payment_page" | "manual_payment_control_visible";

export interface CheckoutHandoffResult {
  mode: CheckoutHandoffMode;
}

export interface CheckoutOptions {
  removeLimitItems?: boolean;
}

export async function openCheckout(page: Page, options: CheckoutOptions = {}): Promise<CheckoutHandoffResult> {
  const cart = await readCheckoutCartPrecondition(page, options);
  const cartText = cart.rawText ?? "";
  assertReadableCheckoutCart(cartText, cart.items);
  if (isCheckoutHandoffText(cartText)) {
    return { mode: "checkout_or_payment_page" };
  }

  const clicked = await clickCheckoutHandoffButton(page);
  if (!clicked) {
    if (await hasVisibleManualCheckoutAction(page)) {
      return { mode: "manual_payment_control_visible" };
    }

    throw new UserFacingError("Could not find a checkout button in the current cart.", {
      code: "checkout_unavailable",
      hint: "Check the browser for missing address, minimum cart value, or unavailable items."
    });
  }

  const postClickHandoff = await detectCheckoutHandoffMode(page);
  if (postClickHandoff?.mode !== "checkout_or_payment_page") {
    throw new UserFacingError("Zepto did not expose a checkout or payment handoff after clicking checkout.", {
      code: "checkout_handoff_unverified",
      hint: "Check the visible browser for missing address, minimum cart value, unavailable items, or changed checkout UI."
    });
  }

  return postClickHandoff;
}

export async function detectCheckoutHandoffMode(page: Page): Promise<CheckoutHandoffResult | undefined> {
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  await assertNoAccessChallenge(page);
  const bodyText = await page.locator("body").innerText().catch(() => "");
  if (isCheckoutHandoffText(bodyText)) {
    return { mode: "checkout_or_payment_page" };
  }

  if (await hasVisibleManualCheckoutAction(page)) {
    return { mode: "manual_payment_control_visible" };
  }

  return undefined;
}

export async function clickCheckoutHandoffButton(page: Page): Promise<boolean> {
  const controls = page.locator("button, [role='button'], a");
  for (const label of CHECKOUT_HANDOFF_CLICK_LABELS) {
    const candidates = [
      page.getByRole("button", { name: label }),
      page.getByRole("link", { name: label }),
      controls.filter({ hasText: label })
    ];

    for (const candidate of candidates) {
      if (await clickFirstSafeCheckoutButton(candidate)) {
        return true;
      }
    }
  }

  return false;
}

async function clickFirstSafeCheckoutButton(locator: Locator): Promise<boolean> {
  for await (const candidate of iterateLocatorCandidates(locator, CHECKOUT_HANDOFF_CONTROL_SCAN_LIMIT)) {
    if (await clickSafeCheckoutButton(candidate)) {
      return true;
    }
  }

  return false;
}

async function clickSafeCheckoutButton(locator: Locator): Promise<boolean> {
  if (!(await isSafeCheckoutButton(locator))) {
    return false;
  }

  await scrollControlIntoViewIfNeeded(locator);
  if (!(await isSafeCheckoutButton(locator))) {
    return false;
  }

  await locator.click({ timeout: CHECKOUT_HANDOFF_CLICK_TIMEOUT_MS });
  return true;
}

async function isSafeCheckoutButton(locator: Locator): Promise<boolean> {
  if (!(await locator.isVisible().catch(() => false))) {
    return false;
  }

  const labels = await readControlLabels(locator);
  if (labels.some(isUnsafeCheckoutAutomationClickText)) {
    return false;
  }

  if (!labels.some(isCheckoutHandoffClickText)) {
    return false;
  }

  return !(await isDisabledControl(locator));
}

async function scrollControlIntoViewIfNeeded(locator: Locator): Promise<void> {
  const scrollable = locator as {
    scrollIntoViewIfNeeded?: () => Promise<void>;
  };
  await scrollable.scrollIntoViewIfNeeded?.().catch(() => undefined);
}

async function readCheckoutCartPrecondition(page: Page, options: CheckoutOptions) {
  try {
    const readOptions = { removeLimitItems: options.removeLimitItems === true };
    let cart = await readCart(page, readOptions);
    for (let attempt = 1; cart.items.length === 0 && attempt < CHECKOUT_EMPTY_CART_REREAD_ATTEMPTS; attempt += 1) {
      await page.waitForTimeout(CHECKOUT_EMPTY_CART_REREAD_DELAY_MS);
      await gotoZepto(page);
      cart = await readCart(page, readOptions);
    }

    return cart;
  } catch (error) {
    if (
      error instanceof UserFacingError &&
      (error.code === "cart_unreadable" || error.code === "cart_navigation_unverified")
    ) {
      throw checkoutCartUnreadableError();
    }
    throw error;
  }
}

export function assertReadableCheckoutCart(text: string, items = parseReadableCartItemsFromText(text)): void {
  if (items.length > 0 && hasStrongCartSurfaceEvidence(text)) {
    return;
  }

  throw checkoutCartUnreadableError();
}

function checkoutCartUnreadableError(): UserFacingError {
  return new UserFacingError("Zepto cart does not show any readable items for checkout.", {
    code: "checkout_cart_unreadable",
    hint: "Add an item with `zepo add`, then run `zepo cart` before retrying checkout."
  });
}

export function isUnsafeCheckoutAutomationClickText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return false;
  }

  if (/^proceed\s+to\s+(?:checkout|payment|pay)$/i.test(normalized)) {
    return false;
  }

  return (
    /^(?:continue|proceed)\b/i.test(normalized) ||
    isFinalPaymentOrOrderActionText(normalized) ||
    isOrderActionLabelText(normalized) ||
    isPaymentMethodLabelText(normalized) ||
    /^(payment|payments)$/i.test(normalized) ||
    /\b(pay|order)\b/i.test(normalized) ||
    /^continue\s+to\s+pay$/i.test(normalized) ||
    /\bcheckout\b.*\b(pay|payment|order)\b/i.test(normalized) ||
    /\bpay\s*(?:₹|rs\.?\s*\d|\d)/i.test(normalized)
  );
}

export function isCheckoutHandoffClickText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized || isUnsafeCheckoutAutomationClickText(normalized)) {
    return false;
  }

  return CHECKOUT_HANDOFF_CLICK_LABELS.some((label) => label.test(normalized));
}

export function isManualCheckoutActionText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return false;
  }

  if (!hasPaymentAmount(normalized) || isPaymentMethodOnlyManualActionText(normalized)) {
    return false;
  }

  return (
    /^(?:click|tap)\s+to\s+pay\b/i.test(normalized) ||
    /^pay(?:\s+now)?\b/i.test(normalized) ||
    /^(?:continue|proceed)\s+to\s+pay\b/i.test(normalized) ||
    /^checkout\s+(?:and|&)\s+pay\b/i.test(normalized)
  );
}

function hasPaymentAmount(text: string): boolean {
  return /(?:₹\s*[\d,]+(?:\.\d+)?|(?:rs\.?|inr)\s*[\d,]+(?:\.\d+)?)/i.test(text);
}

function isPaymentMethodOnlyManualActionText(text: string): boolean {
  return /\bpay\s+with\b|\bpayment\s+method\b|\bcashback\b|\boffers?\b/i.test(text);
}

export function isCheckoutHandoffText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return false;
  }

  if (isOrdinaryCartSurfaceText(normalized) && !isExplicitCheckoutHandoffSurfaceText(normalized)) {
    return false;
  }

  return isStrongCheckoutHandoffSurfaceText(normalized);
}

function isOrdinaryCartSurfaceText(text: string): boolean {
  const hasCartHeading = /\bcart\b/i.test(text);
  const hasCartAction = /\b(add more|apply coupon|view bill|checkout)\b/i.test(text);
  const hasCartSummary = /\b(bill summary|order summary|item total|grand total|to pay|payable)\b/i.test(text);

  return (
    (hasCartHeading && (hasCartAction || hasCartSummary)) ||
    (hasCartSummary && (hasCartAction || isPaymentMethodLabelText(text)))
  );
}

function isStrongCheckoutHandoffSurfaceText(text: string): boolean {
  return (
    isPaymentHandoffSurfaceText(text) ||
    isExplicitCheckoutHandoffSurfaceText(text)
  );
}

function isExplicitCheckoutHandoffSurfaceText(text: string): boolean {
  return (
    isPaymentSelectionPromptText(text) ||
    isFinalCheckoutSurfaceText(text)
  );
}

async function hasVisibleManualCheckoutAction(page: Page): Promise<boolean> {
  const labels = await page
    .locator("button, [role='button'], a")
    .evaluateAll((elements) => {
      const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
      const referencedLabelText = (element: Element) =>
        `${element.getAttribute("aria-labelledby") ?? ""} ${element.getAttribute("aria-describedby") ?? ""}`
          .split(/\s+/)
          .map((id) => id.trim())
          .filter(Boolean)
          .map((id) => element.ownerDocument.getElementById(id)?.textContent ?? "")
          .map(normalize)
          .filter(Boolean);
      const isVisible = (element: Element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      };
      const isDisabled = (element: Element) => {
        const dataDisabled = element.getAttribute("data-disabled");
        return (
          element.hasAttribute("disabled") ||
          element.getAttribute("aria-disabled")?.toLowerCase() === "true" ||
          (dataDisabled !== null && dataDisabled.toLowerCase() !== "false")
        );
      };

      return elements
        .filter((element) => isVisible(element) && !isDisabled(element))
        .map((element) =>
          normalize(
            [
              element.textContent,
              element.getAttribute("aria-label"),
              element.getAttribute("title"),
              element.getAttribute("placeholder"),
              element.getAttribute("value"),
              element.getAttribute("aria-description"),
              ...referencedLabelText(element)
            ]
              .filter(Boolean)
              .join(" ")
          )
        )
        .filter(Boolean);
    })
    .catch(() => []);

  return labels.some(isManualCheckoutActionText);
}

async function* iterateLocatorCandidates(locator: Locator, limit: number): AsyncGenerator<Locator> {
  const count = Math.min(await locatorCount(locator), limit);
  for (let index = 0; index < count; index += 1) {
    yield locatorAt(locator, index);
  }
}

async function locatorCount(locator: Locator): Promise<number> {
  const countable = locator as { count?: () => Promise<number> };
  if (typeof countable.count === "function") {
    return countable.count().catch(() => 0);
  }

  return (await locator.first().isVisible().catch(() => false)) ? 1 : 0;
}

function locatorAt(locator: Locator, index: number): Locator {
  const indexable = locator as { nth?: (index: number) => Locator };
  if (typeof indexable.nth === "function") {
    return indexable.nth(index);
  }

  return index === 0 ? locator.first() : locator;
}
