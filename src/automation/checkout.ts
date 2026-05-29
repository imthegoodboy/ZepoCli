import type { Locator, Page } from "playwright";

import { UserFacingError } from "../utils/errors.js";
import { openCart } from "./cart.js";
import { assertNoAccessChallenge } from "./browser.js";
import { isDisabledControl } from "./control-state.js";
import { parseCartItemsFromText } from "./extract.js";

export const CHECKOUT_HANDOFF_CLICK_LABELS = [
  /^checkout\b.*$/i,
  /^proceed\s+to\s+(?:checkout|payment|pay)$/i,
  /^continue\s+to\s+(?:checkout|payment|pay)$/i
] as const;

export async function openCheckout(page: Page): Promise<void> {
  await openCart(page);
  const cartText = await page.locator("body").innerText().catch(() => "");
  assertReadableCheckoutCart(cartText);
  if (isCheckoutHandoffText(cartText)) {
    return;
  }

  const clicked = await clickCheckoutHandoffButton(page);
  if (!clicked) {
    throw new UserFacingError("Could not find a checkout button in the current cart.", {
      code: "checkout_unavailable",
      hint: "Check the browser for missing address, minimum cart value, or unavailable items."
    });
  }

  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  await assertNoAccessChallenge(page);
  const bodyText = await page.locator("body").innerText().catch(() => "");
  if (!isCheckoutHandoffText(bodyText)) {
    throw new UserFacingError("Zepto did not expose a checkout or payment handoff after clicking checkout.", {
      code: "checkout_handoff_unverified",
      hint: "Check the visible browser for missing address, minimum cart value, unavailable items, or changed checkout UI."
    });
  }
}

export async function clickCheckoutHandoffButton(page: Page): Promise<boolean> {
  const controls = page.locator("button, [role='button'], a");
  for (const label of CHECKOUT_HANDOFF_CLICK_LABELS) {
    const candidates = [
      page.getByRole("button", { name: label }).first(),
      page.getByRole("link", { name: label }).first(),
      controls.filter({ hasText: label }).first()
    ];

    for (const candidate of candidates) {
      if (await clickSafeCheckoutButton(candidate)) {
        return true;
      }
    }
  }

  return false;
}

async function clickSafeCheckoutButton(locator: Locator): Promise<boolean> {
  if (!(await locator.isVisible().catch(() => false))) {
    return false;
  }

  const text = await locator.innerText().catch(() => "");
  const ariaLabel = await locator.getAttribute("aria-label").catch(() => "");
  const labels = [text, ariaLabel ?? ""].filter((label) => label.trim().length > 0);
  if (labels.some(isUnsafeCheckoutAutomationClickText)) {
    return false;
  }

  if (!labels.some(isCheckoutHandoffClickText)) {
    return false;
  }

  if (await isDisabledControl(locator)) {
    return false;
  }

  await locator.click();
  return true;
}

export function assertReadableCheckoutCart(text: string): void {
  if (parseCartItemsFromText(text).length > 0) {
    return;
  }

  throw new UserFacingError("Zepto cart does not show any readable items for checkout.", {
    code: "checkout_cart_unreadable",
    hint: "Add an item with `zepo add`, then run `zepo cart` before retrying checkout."
  });
}

export function isUnsafeCheckoutAutomationClickText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return false;
  }

  if (/^proceed\s+to\s+pay$/i.test(normalized)) {
    return false;
  }

  return (
    /\b(place order|confirm order|pay now|make payment)\b/i.test(normalized) ||
    /\b(payment method|payment methods|select payment|choose payment|payment option|payment options|payment mode)\b/i.test(
      normalized
    ) ||
    /^(payment|payments|upi|cards?|credit card|debit card|wallet|cash on delivery|cod)$/i.test(normalized) ||
    /\b(complete payment|confirm payment|pay securely|pay with|pay using|pay via|pay by|order now|review order)\b/i.test(
      normalized
    ) ||
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

export function isCheckoutHandoffText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return false;
  }

  if (isOrdinaryCartSurfaceText(normalized)) {
    return false;
  }

  if (
    /\b(select payment|payment method|upi|credit card|debit card|wallet|cash on delivery|cod|place order)\b/i.test(
      normalized
    )
  ) {
    return true;
  }

  return false;
}

function isOrdinaryCartSurfaceText(text: string): boolean {
  return (
    /\bcart\b/i.test(text) &&
    /\b(add more|apply coupon|view bill|bill summary|item total|grand total|checkout)\b/i.test(text) &&
    !/\b(select payment|payment method|upi|credit card|debit card|wallet|cash on delivery|cod|place order|order summary)\b/i.test(
      text
    )
  );
}
