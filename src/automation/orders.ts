import type { Page } from "playwright";

import type { OrderSnapshot } from "../types.js";
import { UserFacingError } from "../utils/errors.js";
import { parseOrdersFromText } from "./extract.js";
import { clickFirstText, gotoZepto } from "./browser.js";

export async function openOrders(page: Page): Promise<void> {
  await gotoZepto(page, "/orders");
  let bodyText = await page.locator("body").innerText().catch(() => "");
  if (/order|delivered|track|eta|history/i.test(bodyText)) {
    return;
  }

  await gotoZepto(page);
  await clickFirstText(page, [/orders/i, /my orders/i, /profile/i, /account/i]);
  bodyText = await page.locator("body").innerText().catch(() => "");

  if (!/order|delivered|track|eta|history/i.test(bodyText)) {
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

export async function reorderLast(page: Page): Promise<void> {
  await openOrders(page);

  const clicked = await clickFirstText(page, [/reorder/i, /order again/i, /repeat order/i]);
  if (!clicked) {
    throw new UserFacingError("Could not find a reorder action for the latest order.");
  }

  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
}
