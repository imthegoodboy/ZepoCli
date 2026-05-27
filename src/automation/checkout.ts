import type { Page } from "playwright";

import { UserFacingError } from "../utils/errors.js";
import { openCart } from "./cart.js";
import { clickFirstText } from "./browser.js";

export async function openCheckout(page: Page): Promise<void> {
  await openCart(page);

  const clicked = await clickFirstText(page, [/checkout/i, /proceed/i, /continue/i, /place order/i]);
  if (!clicked) {
    throw new UserFacingError("Could not find a checkout button in the current cart.", {
      hint: "Check the browser for missing address, minimum cart value, or unavailable items."
    });
  }

  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  const bodyText = await page.locator("body").innerText().catch(() => "");
  if (!isCheckoutHandoffText(bodyText)) {
    throw new UserFacingError("Zepto did not expose a checkout or payment handoff after clicking checkout.", {
      hint: "Check the visible browser for missing address, minimum cart value, unavailable items, or changed checkout UI."
    });
  }
}

export function isCheckoutHandoffText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return false;
  }

  return /\b(checkout|payment|pay|upi|card|wallet|cash on delivery|place order|delivery address|order summary|to pay)\b/i.test(
    normalized
  );
}
