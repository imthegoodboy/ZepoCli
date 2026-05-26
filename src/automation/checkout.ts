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
}
