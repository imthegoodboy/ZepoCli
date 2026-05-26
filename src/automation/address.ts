import type { Page } from "playwright";

import type { Address } from "../types.js";
import { UserFacingError } from "../utils/errors.js";
import { normalizeText } from "../utils/format.js";
import { clickFirstText, gotoZepto } from "./browser.js";

export async function openAddressManager(page: Page): Promise<void> {
  await gotoZepto(page);

  const clicked = await clickFirstText(page, [
    /deliver(?:ing)? to/i,
    /select location/i,
    /add address/i,
    /address/i,
    /location/i
  ]);

  if (!clicked) {
    throw new UserFacingError("Could not open Zepto address controls.", {
      hint: "Open `zepo login` first and confirm your location/address in the browser."
    });
  }

  await page.waitForTimeout(800);
}

export async function listAddresses(page: Page): Promise<Address[]> {
  await openAddressManager(page);

  return page.evaluate(() => {
    const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
    const isAddressText = (text: string) =>
      text.length > 12 &&
      text.length < 300 &&
      /(home|work|other|address|house|flat|road|street|sector|phase|apartment|building|floor|pin|india)/i.test(text);

    const candidates = Array.from(document.querySelectorAll("button, [role='button'], li, article, section, div"))
      .map((element) => normalize(element.textContent ?? ""))
      .filter(isAddressText);

    const seen = new Set<string>();
    return candidates
      .filter((text) => {
        const key = text.toLowerCase();
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      })
      .slice(0, 20)
      .map((text) => {
        const label = text.match(/\b(Home|Work|Other)\b/i)?.[1];
        return {
          label,
          text,
          selected: /selected|deliver(?:ing)? here/i.test(text)
        };
      });
  });
}

export async function useAddress(page: Page, query: string): Promise<Address> {
  await openAddressManager(page);

  const matched = await page.evaluate((addressQuery) => {
    const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
    const queryText = normalize(addressQuery).toLowerCase();
    const elements = Array.from(document.querySelectorAll("button, [role='button'], li, article, section, div"));

    for (const [index, element] of elements.entries()) {
      const text = normalize(element.textContent ?? "");
      if (text.toLowerCase().includes(queryText) && text.length < 400) {
        element.setAttribute("data-zepo-address-id", String(index));
        return {
          index,
          text,
          label: text.match(/\b(Home|Work|Other)\b/i)?.[1]
        };
      }
    }

    return undefined;
  }, query);

  if (!matched) {
    throw new UserFacingError(`Could not find a saved address matching "${query}".`);
  }

  await page.locator(`[data-zepo-address-id="${matched.index}"]`).first().click();
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);

  return {
    label: matched.label,
    text: normalizeText(matched.text),
    selected: true
  };
}

export async function startAddAddress(page: Page): Promise<void> {
  await openAddressManager(page);

  const clicked = await clickFirstText(page, [/add new/i, /add address/i, /enter.*location/i, /use current location/i]);
  if (!clicked) {
    throw new UserFacingError("Could not find an add-address action.", {
      hint: "Use the visible browser to add or edit your address manually."
    });
  }
}
