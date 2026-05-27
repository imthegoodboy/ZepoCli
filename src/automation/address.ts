import type { Page } from "playwright";

import type { Address } from "../types.js";
import { UserFacingError } from "../utils/errors.js";
import { normalizeText } from "../utils/format.js";
import { clickFirstText, gotoZepto } from "./browser.js";

const ADDRESS_DETAIL_PATTERN =
  "\\b(home|work|other|house|flat|road|street|sector|phase|apartment|building|floor|tower|block|pin|pincode|india)\\b|\\d{3,}";
const ADDRESS_PLACEHOLDER_PATTERN =
  "^(add|select|enter|use|choose|set|change)\\b.*\\b(address|location)\\b|^(delivery address|saved addresses|select location|add address)$";

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

  return page.evaluate(({ detailPattern, placeholderPattern }) => {
    const detailRegex = new RegExp(detailPattern, "i");
    const placeholderRegex = new RegExp(placeholderPattern, "i");
    const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
    const isAddressText = (text: string) => {
      const normalized = normalize(text);
      return normalized.length > 12 && normalized.length < 300 && detailRegex.test(normalized) && !placeholderRegex.test(normalized);
    };

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
          selected: /selected|deliver(?:ing)? (?:here|to)/i.test(text)
        };
      });
  }, {
    detailPattern: ADDRESS_DETAIL_PATTERN,
    placeholderPattern: ADDRESS_PLACEHOLDER_PATTERN
  });
}

export async function useAddress(page: Page, query: string): Promise<Address> {
  await openAddressManager(page);

  const matched = await page.evaluate(({ addressQuery, detailPattern, placeholderPattern }) => {
    const detailRegex = new RegExp(detailPattern, "i");
    const placeholderRegex = new RegExp(placeholderPattern, "i");
    const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
    const queryText = normalize(addressQuery).toLowerCase();
    const elements = Array.from(document.querySelectorAll("button, [role='button'], li, article, section, div"));

    for (const [index, element] of elements.entries()) {
      const text = normalize(element.textContent ?? "");
      const isAddressText = text.length > 12 && text.length < 400 && detailRegex.test(text) && !placeholderRegex.test(text);
      if (isAddressText && text.toLowerCase().includes(queryText)) {
        element.setAttribute("data-zepo-address-id", String(index));
        return {
          index,
          text,
          label: text.match(/\b(Home|Work|Other)\b/i)?.[1]
        };
      }
    }

    return undefined;
  }, {
    addressQuery: query,
    detailPattern: ADDRESS_DETAIL_PATTERN,
    placeholderPattern: ADDRESS_PLACEHOLDER_PATTERN
  });

  if (!matched) {
    throw new UserFacingError(`Could not find a saved address matching "${query}".`);
  }

  await page.locator(`[data-zepo-address-id="${matched.index}"]`).first().click();
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);

  const addresses = await listAddresses(page);
  return requireSelectedAddress(addresses, query);
}

export function requireSelectedAddress(addresses: Address[], query: string): Address {
  const selected = addresses.find((address) => address.selected && addressMatchesQuery(address, query));
  if (selected) {
    return selected;
  }

  throw new UserFacingError(`Zepto did not show a selected address matching "${query}" after the selection click.`, {
    hint: "Rerun with `--visible --debug` and confirm Zepto marks the requested address as selected before retrying checkout."
  });
}

export function addressMatchesQuery(address: Address, query: string): boolean {
  const queryText = normalizeText(query).toLowerCase();
  const addressText = normalizeText([address.label, address.text].filter(Boolean).join(" ")).toLowerCase();
  return queryText.length > 0 && (addressText.includes(queryText) || queryText.includes(addressText));
}

export function isLikelyAddressText(text: string): boolean {
  const normalized = normalizeText(text);
  return (
    normalized.length > 12 &&
    normalized.length < 300 &&
    new RegExp(ADDRESS_DETAIL_PATTERN, "i").test(normalized) &&
    !new RegExp(ADDRESS_PLACEHOLDER_PATTERN, "i").test(normalized)
  );
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
