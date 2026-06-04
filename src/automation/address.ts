import type { Locator, Page } from "playwright";

import type { Address } from "../types.js";
import { UserFacingError } from "../utils/errors.js";
import { looksLikeUnit, normalizeText } from "../utils/format.js";
import { assertNoAccessChallenge, gotoZepto } from "./browser.js";
import { isDisabledControl, readControlLabels } from "./control-state.js";
import {
  FINAL_PAYMENT_OR_ORDER_ACTION_PATTERN_SOURCE,
  isFinalPaymentOrOrderActionText
} from "./final-action-labels.js";
import { ORDER_ACTION_LABEL_PATTERN_SOURCE } from "./order-action-labels.js";
import { isPaymentMethodLabelText, PAYMENT_METHOD_LABEL_PATTERN_SOURCE } from "./payment-labels.js";

const ADDRESS_DETAIL_PATTERN =
  "\\b(road|rd|street|st|lane|layout|sector|phase|apartment|building|tower|block|wing|society|colony|landmark|near|opposite|pincode|pin\\s+code|postal\\s+code)\\b|\\b[A-Z0-9]{4}\\+[A-Z0-9]{3,}\\b|\\b[a-z]\\s*[-/]\\s*\\d{2,}\\b|\\b\\d{5,6}\\b";
const ADDRESS_PLACEHOLDER_PATTERN =
  "^(add|select|enter|use|choose|set|change)\\b.*\\b(address|location)\\b|^(delivery address|saved addresses|select location|add address)$";
const ADDRESS_LOCATION_CONSENT_SURFACE_PATTERN =
  "\\b(use (?:my |your |device )?current location|use device location|allow (?:browser |precise )?location|allow location access|share (?:my |your |current |device )?location|detect (?:my |your |current |device )?location|get current location|find (?:my |your |current )?location|enable (?:browser |precise )?location|enable location services|use precise location|grant location access|turn on location|locate me|use gps|enter current location)\\b";
const ADDRESS_FINAL_CONFIRMATION_SURFACE_PATTERN =
  "\\b(confirm address|confirm location|save\\s+(?:&|and)\\s+(?:continue|proceed)|save address|use this address|deliver here|select this location)\\b";
const ADDRESS_UNRELATED_CLICK_SURFACE_PATTERN =
  `\\b(cart|my cart|checkout|proceed(?:\\s+to)?|continue|payment|payments|pay(?:\\s+now)?|make payment|place order|confirm order|orders?|order history|track order|reorder|order again|repeat order|order summary|bill summary|view bill|item total|grand total|to pay|coupon|promo|voucher|delivery fee|delivery charge|handling fee|platform fee)\\b|${FINAL_PAYMENT_OR_ORDER_ACTION_PATTERN_SOURCE}|${ORDER_ACTION_LABEL_PATTERN_SOURCE}`;
const NON_ADDRESS_SURFACE_PATTERN =
  `\\b(add|cart|checkout|payment|pay|order summary|bill summary|item total|grand total|to pay|coupon|delivery fee|recommended|sponsored|popular picks|you may also like|out of stock|near me)\\b|₹|\\brs\\.?\\s?\\d|\\binr\\s?\\d|${FINAL_PAYMENT_OR_ORDER_ACTION_PATTERN_SOURCE}|${PAYMENT_METHOD_LABEL_PATTERN_SOURCE}|${ADDRESS_LOCATION_CONSENT_SURFACE_PATTERN}|${ADDRESS_FINAL_CONFIRMATION_SURFACE_PATTERN}|${ORDER_ACTION_LABEL_PATTERN_SOURCE}`;
const CURRENT_DELIVERY_ADDRESS_CONTEXT_PATTERN =
  "\\b(selected|default|current|deliver(?:ing)?\\s+(?:to|here)|delivery\\s+(?:to|at|in))\\b";
const ADDRESS_CONTAINER_PREFIX_PATTERN = /^(saved|manage|my|select|delivery)\s+addresses?\b/i;
const CURRENT_DELIVERY_ADDRESS_ATTEMPTS = 5;
const CURRENT_DELIVERY_ADDRESS_POLL_MS = 400;
export const ADDRESS_MANAGER_CLICK_LABELS = [
  /^deliver(?:ing)? to\b.*$/i,
  /^select (?:delivery )?(?:address|location)$/i,
  /^change (?:delivery )?(?:address|location)$/i,
  /^set (?:delivery )?(?:address|location)$/i,
  /^choose (?:delivery )?(?:address|location)$/i,
  /^delivery address$/i,
  /^saved addresses$/i
] as const;
export const ADD_ADDRESS_CLICK_LABELS = [
  /^add new$/i,
  /^add address$/i,
  /^add new address$/i,
  /^add (?:new )?(?:delivery )?location$/i,
  /^add (?:new )?delivery address$/i,
  /^enter (?:complete |delivery )?address$/i,
  /^enter\s+(?:delivery\s+)?location$/i
] as const;
const ADDRESS_CONTROL_SCAN_LIMIT = 8;

export interface AddressSelectionCandidate {
  index: number;
  text: string;
  label?: string;
  clickText?: string;
}

export async function openAddressManager(page: Page): Promise<void> {
  await gotoZepto(page);

  const clicked = await clickAddressManagerButton(page);

  if (!clicked) {
    throw new UserFacingError("Could not open Zepto address controls.", {
      code: "address_controls_unavailable",
      hint: "Open `zepo --visible login` first and confirm your location/address in the browser."
    });
  }

  await page.waitForTimeout(800);
  await assertNoAccessChallenge(page);
}

export async function clickAddressManagerButton(page: Page): Promise<boolean> {
  const controls = page.locator("button, [role='button'], a");
  for (const label of ADDRESS_MANAGER_CLICK_LABELS) {
    const candidates = [
      page.getByRole("button", { name: label }),
      page.getByRole("link", { name: label }),
      controls.filter({ hasText: label })
    ];

    for (const candidate of candidates) {
      if (await clickFirstSafeAddressManagerControl(candidate)) {
        return true;
      }
    }
  }

  if (await clickFirstSafeAddressManagerControl(controls)) {
    return true;
  }

  return false;
}

async function clickFirstSafeAddressManagerControl(locator: Locator): Promise<boolean> {
  for await (const candidate of iterateLocatorCandidates(locator, ADDRESS_CONTROL_SCAN_LIMIT)) {
    if (await clickSafeAddressManagerControl(candidate)) {
      return true;
    }
  }

  return false;
}

async function clickSafeAddressManagerControl(locator: Locator): Promise<boolean> {
  if (!(await isSafeAddressManagerControl(locator))) {
    return false;
  }

  await scrollControlIntoViewIfNeeded(locator);

  if (!(await isSafeAddressManagerControl(locator))) {
    return false;
  }

  await locator.click();
  return true;
}

async function isSafeAddressManagerControl(locator: Locator): Promise<boolean> {
  if (!(await locator.isVisible().catch(() => false))) {
    return false;
  }

  const labels = await readControlLabels(locator);
  if (labels.some(isUnsafeAddressAutomationClickText)) {
    return false;
  }

  if (!labels.some(isAddressManagerClickText)) {
    return false;
  }

  if (await isDisabledControl(locator)) {
    return false;
  }

  return true;
}

export async function listAddresses(page: Page): Promise<Address[]> {
  await openAddressManager(page);

  const addressTexts = await page.evaluate(({ detailPattern, placeholderPattern, nonAddressPattern }) => {
    const detailRegex = new RegExp(detailPattern, "i");
    const placeholderRegex = new RegExp(placeholderPattern, "i");
    const nonAddressRegex = new RegExp(nonAddressPattern, "i");
    const unitRegex =
      /\b\d+(?:\.\d+)?\s?(?:ml|l|ltr|litre|litres|liter|liters|g|gm|gms|gram|grams|kg|kgs|pc|pcs|piece|pieces|pack|packs|packet|packets|bottle|bottles|box|boxes|can|cans|jar|jars|pouch|pouches|sachet|sachets|dozen|tablet|tablets|tabs|capsule|capsules)\b/i;
    const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
    const isAddressText = (text: string) => {
      const normalized = normalize(text);
      return (
        normalized.length > 12 &&
        normalized.length < 300 &&
        detailRegex.test(normalized) &&
        !placeholderRegex.test(normalized) &&
        !nonAddressRegex.test(normalized) &&
        !unitRegex.test(normalized)
      );
    };
    const visibleText = (element: Element) =>
      element instanceof HTMLElement ? normalize(element.innerText) : normalize(element.textContent ?? "");
    const hasAddressDescendant = (element: Element, text: string) =>
      Array.from(element.querySelectorAll("button, [role='button'], li, article, section, div")).some((child) => {
        if (child === element) {
          return false;
        }

        const childText = visibleText(child);
        return childText.length <= text.length && text.includes(childText) && isAddressText(childText);
      });

    const candidates = Array.from(document.querySelectorAll("button, [role='button'], li, article, section, div"))
      .map((element) => ({
        element,
        text: visibleText(element)
      }))
      .filter(({ element, text }) => isAddressText(text) && !hasAddressDescendant(element, text))
      .map(({ text }) => text);

    return candidates;
  }, {
    detailPattern: ADDRESS_DETAIL_PATTERN,
    placeholderPattern: ADDRESS_PLACEHOLDER_PATTERN,
    nonAddressPattern: NON_ADDRESS_SURFACE_PATTERN
  });

  return addressRecordsFromTexts(addressTexts).slice(0, 20);
}

export async function useAddress(page: Page, query: string): Promise<Address> {
  await gotoZepto(page);
  const currentAddress = await readCurrentDeliveryAddress(page, query);
  if (currentAddress) {
    return currentAddress;
  }

  await openAddressManager(page);
  const currentAddressAfterManagerOpen = await readCurrentDeliveryAddress(page, query);
  if (currentAddressAfterManagerOpen) {
    return currentAddressAfterManagerOpen;
  }

  const candidates = await page.evaluate(({ detailPattern, placeholderPattern, nonAddressPattern }) => {
    const detailRegex = new RegExp(detailPattern, "i");
    const placeholderRegex = new RegExp(placeholderPattern, "i");
    const nonAddressRegex = new RegExp(nonAddressPattern, "i");
    const unitRegex =
      /\b\d+(?:\.\d+)?\s?(?:ml|l|ltr|litre|litres|liter|liters|g|gm|gms|gram|grams|kg|kgs|pc|pcs|piece|pieces|pack|packs|packet|packets|bottle|bottles|box|boxes|can|cans|jar|jars|pouch|pouches|sachet|sachets|dozen|tablet|tablets|tabs|capsule|capsules)\b/i;
    const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
    const visibleText = (element: Element) =>
      element instanceof HTMLElement ? normalize(element.innerText) : normalize(element.textContent ?? "");
    const isAddressText = (text: string) =>
      text.length > 12 &&
      text.length < 400 &&
      detailRegex.test(text) &&
      !placeholderRegex.test(text) &&
      !nonAddressRegex.test(text) &&
      !unitRegex.test(text);
    const hasAddressDescendant = (element: Element, text: string) =>
      Array.from(element.querySelectorAll("button, [role='button'], li, article, section, div")).some((child) => {
        if (child === element) {
          return false;
        }

        const childText = visibleText(child);
        return childText.length <= text.length && text.includes(childText) && isAddressText(childText);
      });
    const addressDescendantCount = (element: Element) => {
      const uniqueTexts = new Set<string>();
      for (const child of element.querySelectorAll("button, [role='button'], li, article, section, div")) {
        const childText = visibleText(child);
        if (isAddressText(childText)) {
          uniqueTexts.add(childText.toLowerCase());
        }
      }

      return uniqueTexts.size;
    };
    const clickTargetForAddress = (element: Element, text: string, elements: Element[]) => {
      let selected = element;
      for (let current: Element | null = element; current; current = current.parentElement) {
        if (!elements.includes(current)) {
          continue;
        }

        const currentText = visibleText(current);
        if (!currentText.includes(text) || !isAddressText(currentText)) {
          continue;
        }

        if (addressDescendantCount(current) <= 1) {
          selected = current;
        }
      }

      return selected;
    };
    const isPageChromeAddress = (element: Element) => element.closest("header, nav") !== null;
    const elements = Array.from(document.querySelectorAll("button, [role='button'], li, article, section, div"));
    const candidates: Array<{ index: number; text: string; label?: string; clickText?: string }> = [];

    for (const [index, element] of elements.entries()) {
      if (isPageChromeAddress(element)) {
        continue;
      }

      const text = visibleText(element);
      if (isAddressText(text) && !hasAddressDescendant(element, text)) {
        const target = clickTargetForAddress(element, text, elements);
        const targetIndex = elements.indexOf(target);
        const clickText = visibleText(target);
        candidates.push({
          index: targetIndex >= 0 ? targetIndex : index,
          text,
          ...(clickText && clickText !== text ? { clickText } : {})
        });
      }
    }

    return candidates;
  }, {
    detailPattern: ADDRESS_DETAIL_PATTERN,
    placeholderPattern: ADDRESS_PLACEHOLDER_PATTERN,
    nonAddressPattern: NON_ADDRESS_SURFACE_PATTERN
  });

  const matched = chooseAddressSelectionCandidate(candidates, query);

  if (!matched) {
    throw new UserFacingError(`Could not find a saved address matching "${query}".`, {
      code: "address_not_found"
    });
  }

  const selectedAddress = selectedAddressFromSelectionCandidates(candidates, query);
  if (selectedAddress) {
    return selectedAddress;
  }

  await clickTaggedAddressSelection(page, matched);
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  await assertNoAccessChallenge(page);

  await gotoZepto(page);
  const selectedCurrentAddress = await readCurrentDeliveryAddress(page, query);
  if (selectedCurrentAddress) {
    return selectedCurrentAddress;
  }

  const addresses = await listAddresses(page);
  return requireSelectedAddress(addresses, query);
}

function selectedAddressFromSelectionCandidates(
  candidates: AddressSelectionCandidate[],
  query: string
): Address | undefined {
  const addresses = addressRecordsFromTexts(
    candidates.flatMap((candidate) => [candidate.text, candidate.clickText ?? ""])
  );
  return addresses.find((address) => address.selected && addressMatchesQuery(address, query));
}

async function readCurrentDeliveryAddress(page: Page, query: string): Promise<Address | undefined> {
  for (let attempt = 1; attempt <= CURRENT_DELIVERY_ADDRESS_ATTEMPTS; attempt += 1) {
    const currentAddress = await readCurrentDeliveryAddressOnce(page, query);
    if (currentAddress || attempt === CURRENT_DELIVERY_ADDRESS_ATTEMPTS) {
      return currentAddress;
    }

    await page.waitForTimeout(CURRENT_DELIVERY_ADDRESS_POLL_MS).catch(() => undefined);
  }

  return undefined;
}

async function readCurrentDeliveryAddressOnce(page: Page, query: string): Promise<Address | undefined> {
  const addressTexts = await page.evaluate(({
    currentContextPattern,
    detailPattern,
    placeholderPattern,
    nonAddressPattern,
    query
  }) => {
    const currentContextRegex = new RegExp(currentContextPattern, "i");
    const detailRegex = new RegExp(detailPattern, "i");
    const placeholderRegex = new RegExp(placeholderPattern, "i");
    const nonAddressRegex = new RegExp(nonAddressPattern, "i");
    const unitRegex =
      /\b\d+(?:\.\d+)?\s?(?:ml|l|ltr|litre|litres|liter|liters|g|gm|gms|gram|grams|kg|kgs|pc|pcs|piece|pieces|pack|packs|packet|packets|bottle|bottles|box|boxes|can|cans|jar|jars|pouch|pouches|sachet|sachets|dozen|tablet|tablets|tabs|capsule|capsules)\b/i;
    const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
    const visibleText = (element: Element) =>
      element instanceof HTMLElement ? normalize(element.innerText) : normalize(element.textContent ?? "");
    const referencedText = (element: Element, attribute: string) =>
      (element.getAttribute(attribute) ?? "")
        .split(/\s+/)
        .map((id) => element.ownerDocument.getElementById(id)?.textContent ?? "")
        .join(" ");
    const attributeText = (element: Element) =>
      normalize(
        [
          element.getAttribute("aria-label"),
          element.getAttribute("title"),
          element.getAttribute("placeholder"),
          element.getAttribute("value"),
          element.getAttribute("aria-description"),
          referencedText(element, "aria-labelledby"),
          referencedText(element, "aria-describedby")
        ]
          .filter(Boolean)
          .join(" ")
      );
    const isAddressText = (text: string) =>
      text.length > 12 &&
      text.length < 300 &&
      detailRegex.test(text) &&
      !placeholderRegex.test(text) &&
      !nonAddressRegex.test(text) &&
      !unitRegex.test(text);
    const queryText = normalize(query).toLowerCase();
    const queryTerms = queryText.match(/[a-z0-9]+/g) ?? [];
    const textTerms = (text: string) => normalize(text).toLowerCase().match(/[a-z0-9]+/g) ?? [];
    const roughlyMatchesQuery = (text: string) => {
      if (queryTerms.length === 0) {
        return true;
      }

      const normalizedText = normalize(text).toLowerCase();
      if (queryTerms.length > 1 && normalizedText.includes(queryText)) {
        return true;
      }

      const terms = textTerms(text);
      return queryTerms.every((queryTerm) =>
        terms.some((term) => term === queryTerm || (queryTerm.length >= 3 && term.startsWith(queryTerm)))
      );
    };
    const textValues = (element: Element) => {
      const values = [visibleText(element), attributeText(element)].filter(Boolean);
      const combined = normalize(values.join(" "));
      return [combined, ...values].filter(Boolean);
    };
    const hasCurrentDeliveryContext = (element: Element) => {
      for (let current: Element | null = element; current; current = current.parentElement) {
        if (textValues(current).some((text) => currentContextRegex.test(text))) {
          return true;
        }
      }

      return false;
    };

    return Array.from(document.querySelectorAll("button, [role='button'], a, header, nav, section, div")).flatMap(
      (element) => {
        const addressValues = textValues(element).filter(
          (text) => isAddressText(text) && roughlyMatchesQuery(text)
        );
        if (addressValues.length === 0 || !hasCurrentDeliveryContext(element)) {
          return [];
        }

        return addressValues;
      }
    );
  }, {
    currentContextPattern: CURRENT_DELIVERY_ADDRESS_CONTEXT_PATTERN,
    detailPattern: ADDRESS_DETAIL_PATTERN,
    placeholderPattern: ADDRESS_PLACEHOLDER_PATTERN,
    nonAddressPattern: NON_ADDRESS_SURFACE_PATTERN,
    query
  });

  const candidates = filterAddressTexts(addressTexts).map((text, index) => ({ index, text }));
  const matched = chooseAddressSelectionCandidate(candidates, query);
  if (!matched) {
    return undefined;
  }

  return {
    ...addressFromText(matched.text),
    selected: true
  };
}

export async function clickTaggedAddressSelection(
  page: Page,
  candidate: AddressSelectionCandidate
): Promise<void> {
  const tagged = await page.evaluate(({ index, expectedText, expectedClickText }) => {
    const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
    const visibleText = (element: Element) =>
      element instanceof HTMLElement ? normalize(element.innerText) : normalize(element.textContent ?? "");

    document
      .querySelectorAll("[data-zepo-address-id]")
      .forEach((element) => element.removeAttribute("data-zepo-address-id"));

    const elements = Array.from(document.querySelectorAll("button, [role='button'], li, article, section, div"));
    const element = elements[index];
    const clickText = normalize(expectedClickText);
    const addressText = normalize(expectedText);
    const currentText = element ? visibleText(element) : "";
    if (!element || currentText !== clickText || !currentText.includes(addressText)) {
      return false;
    }

    element.setAttribute("data-zepo-address-id", String(index));
    return true;
  }, {
    index: candidate.index,
    expectedText: candidate.text,
    expectedClickText: candidate.clickText ?? candidate.text
  });

  if (!tagged) {
    throw new UserFacingError("Zepto address list changed before the selected address could be clicked.", {
      code: "address_selection_stale",
      hint: "Rerun `zepo address use` after checking the current saved addresses with `zepo address list`."
    });
  }

  const locator = page.locator(`[data-zepo-address-id="${candidate.index}"]`).first();
  await assertTaggedAddressSelectionReady(locator, candidate);
  await scrollControlIntoViewIfNeeded(locator);
  await assertTaggedAddressSelectionReady(locator, candidate);
  await locator.click();
}

async function assertTaggedAddressSelectionReady(
  locator: Locator,
  candidate: AddressSelectionCandidate
): Promise<void> {
  if (!(await locator.isVisible().catch(() => false))) {
    throw new UserFacingError("Zepto address selection control changed before it could be clicked.", {
      code: "address_selection_control_unavailable",
      hint: "Rerun `zepo address use` after checking the current saved addresses with `zepo address list`."
    });
  }

  const currentText = normalizeText(await locator.innerText().catch(() => ""));
  const expectedClickText = normalizeText(candidate.clickText ?? candidate.text);
  const expectedAddressText = normalizeText(candidate.text);
  if (currentText !== expectedClickText || !currentText.includes(expectedAddressText)) {
    throw new UserFacingError("Zepto address list changed before the selected address could be clicked.", {
      code: "address_selection_stale",
      hint: "Rerun `zepo address use` after checking the current saved addresses with `zepo address list`."
    });
  }

  const labels = await readControlLabels(locator);
  if (labels.some(isUnsafeAddressAutomationClickText)) {
    throw new UserFacingError("Zepto address selection control points at an unsafe address action.", {
      code: "address_selection_control_unsafe",
      hint: "Select the address manually in the visible browser, then rerun the command."
    });
  }

  if (await isDisabledControl(locator)) {
    throw new UserFacingError("Zepto address selection control is disabled.", {
      code: "address_selection_control_disabled",
      hint: "The saved address may no longer be selectable. Rerun `zepo address list` or inspect with `--visible`."
    });
  }
}

async function scrollControlIntoViewIfNeeded(locator: Locator): Promise<void> {
  const scrollable = locator as {
    scrollIntoViewIfNeeded?: () => Promise<void>;
  };
  await scrollable.scrollIntoViewIfNeeded?.().catch(() => undefined);
}

export function requireSelectedAddress(addresses: Address[], query: string): Address {
  const selected = addresses.find((address) => address.selected && addressMatchesQuery(address, query));
  if (selected) {
    return selected;
  }

  throw new UserFacingError(`Zepto did not show a selected address matching "${query}" after the selection click.`, {
    code: "address_selection_unverified",
    hint: "Rerun with `--visible` and confirm Zepto marks the requested address as selected before retrying checkout."
  });
}

export function addressMatchesQuery(address: Address, query: string): boolean {
  const queryText = normalizeText(query).toLowerCase();
  const labelText = normalizeText(address.label ?? "").toLowerCase();
  const addressText = normalizeText([address.label, address.text].filter(Boolean).join(" ")).toLowerCase();
  return queryText.length > 0 && (labelText === queryText || addressTextMatchesQuery(addressText, queryText));
}

export function chooseAddressSelectionCandidate(
  candidates: AddressSelectionCandidate[],
  query: string
): AddressSelectionCandidate | undefined {
  const queryText = normalizeText(query).toLowerCase();
  if (!queryText) {
    return undefined;
  }

  const normalizedCandidates = normalizeAddressSelectionCandidates(candidates);
  const ranked = normalizedCandidates
    .filter((candidate) => addressSelectionCandidateMatchesQuery(candidate, queryText))
    .map((candidate) => ({
      candidate,
      rank: addressSelectionMatchRank(candidate, queryText)
    }))
    .sort((left, right) => left.rank - right.rank || left.candidate.index - right.candidate.index);

  const best = ranked[0];
  if (!best) {
    return undefined;
  }

  const bestMatches = ranked.filter((match) => match.rank === best.rank);
  if (bestMatches.length > 1) {
    throw new UserFacingError(`Multiple saved addresses matched "${query}".`, {
      code: "address_match_ambiguous",
      hint: "Run `zepo address list` and retry with more unique visible address text, such as street, building, or pincode."
    });
  }

  return best.candidate;
}

export function filterAddressTexts(texts: string[]): string[] {
  const candidates = uniqueAddressTexts(texts);
  return candidates.filter((text) => !isAddressContainerText(text, candidates));
}

export function addressRecordsFromTexts(texts: string[]): Address[] {
  const rawCandidates = uniqueAddressTexts(texts);
  const filteredTexts = rawCandidates.filter((text) => !isAddressContainerText(text, rawCandidates));

  return filteredTexts.map((text) => {
    const address = addressFromText(text);
    if (
      !address.selected &&
      rawCandidates.some((rawText) => isSelectedAddressWrapperForChild(rawText, text, rawCandidates))
    ) {
      return {
        ...address,
        selected: true
      };
    }

    return address;
  });
}

export function isLikelyAddressText(text: string): boolean {
  const normalized = normalizeText(text);
  return (
    normalized.length > 12 &&
    normalized.length < 300 &&
    new RegExp(ADDRESS_DETAIL_PATTERN, "i").test(normalized) &&
    !new RegExp(ADDRESS_PLACEHOLDER_PATTERN, "i").test(normalized) &&
    !new RegExp(NON_ADDRESS_SURFACE_PATTERN, "i").test(normalized) &&
    !looksLikeUnit(normalized)
  );
}

function addressFromText(text: string): Address {
  const label = extractAddressLabel(text);
  return {
    label,
    text,
    selected: /selected|deliver(?:ing)? (?:here|to)/i.test(text)
  };
}

function uniqueAddressTexts(texts: string[]): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();
  for (const text of texts.map(normalizeText).filter(isLikelyAddressText)) {
    const key = text.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    candidates.push(text);
  }

  return candidates;
}

function isSelectedAddressWrapperForChild(wrapper: string, child: string, candidates: string[]): boolean {
  const normalizedWrapper = normalizeText(wrapper);
  const normalizedChild = normalizeText(child);
  if (normalizedWrapper === normalizedChild || !addressFromText(normalizedWrapper).selected) {
    return false;
  }

  const wrapperKey = normalizedWrapper.toLowerCase();
  const childKey = normalizedChild.toLowerCase();
  const childIndex = wrapperKey.indexOf(childKey);
  if (childIndex < 0) {
    return false;
  }

  const containedAddresses = candidates.filter(
    (candidate) => candidate !== wrapper && wrapperKey.includes(candidate.toLowerCase())
  );
  if (containedAddresses.length !== 1) {
    return false;
  }

  const prefix = normalizeText(normalizedWrapper.slice(0, childIndex));
  const suffix = normalizeText(normalizedWrapper.slice(childIndex + normalizedChild.length));
  const selectedMarker = new RegExp(CURRENT_DELIVERY_ADDRESS_CONTEXT_PATTERN, "i");
  return selectedMarker.test(prefix) || selectedMarker.test(suffix.slice(0, 80));
}

function isAddressContainerText(text: string, candidates: string[]): boolean {
  const key = text.toLowerCase();
  const containedAddresses = candidates.filter(
    (candidate) => candidate !== text && key.includes(candidate.toLowerCase())
  );

  if (containedAddresses.length === 0) {
    return false;
  }

  if (containedAddresses.length > 1 || ADDRESS_CONTAINER_PREFIX_PATTERN.test(text)) {
    return true;
  }

  const contained = containedAddresses[0];
  if (!contained) {
    return false;
  }

  const containedIndex = key.indexOf(contained.toLowerCase());
  const prefix = containedIndex >= 0 ? normalizeText(text.slice(0, containedIndex)) : "";
  if (
    /^(?:selected|default|current|home|work|other|deliver(?:ing)?\s+(?:to|here)|delivery\s+(?:to|at))[\s:,-]*$/i.test(
      prefix
    )
  ) {
    return true;
  }

  const strippedPrefix = stripAddressLabelPrefix(prefix);
  return strippedPrefix.length === 0 || normalizeAddressLabel(strippedPrefix) !== undefined;
}

function normalizeAddressSelectionCandidates(candidates: AddressSelectionCandidate[]): AddressSelectionCandidate[] {
  const uniqueCandidates: AddressSelectionCandidate[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const text = normalizeText(candidate.text);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueCandidates.push({
      ...candidate,
      text,
      ...(normalizeText(candidate.clickText ?? "") ? { clickText: normalizeText(candidate.clickText ?? "") } : {}),
      label: normalizeAddressLabel(candidate.label) ?? extractAddressLabel(text)
    });
  }

  const candidateTexts = uniqueCandidates.map((candidate) => candidate.text);
  return uniqueCandidates.filter((candidate) => !isAddressContainerText(candidate.text, candidateTexts));
}

function addressSelectionCandidateMatchesQuery(candidate: AddressSelectionCandidate, queryText: string): boolean {
  return (
    addressTextMatchesQuery(candidate.text, queryText) ||
    normalizeText(candidate.label ?? "").toLowerCase() === queryText
  );
}

function addressSelectionMatchRank(candidate: AddressSelectionCandidate, queryText: string): number {
  const text = normalizeText(candidate.text).toLowerCase();
  const label = normalizeText(candidate.label ?? "").toLowerCase();
  if (text === queryText || label === queryText) {
    return 0;
  }

  if (text.startsWith(queryText)) {
    return 1;
  }

  return 2;
}

export function extractAddressLabel(text: string): string | undefined {
  const normalized = normalizeText(text);
  if (!normalized) {
    return undefined;
  }

  const addressDetail = new RegExp(ADDRESS_DETAIL_PATTERN, "i").exec(normalized);
  if (!addressDetail?.index) {
    return undefined;
  }

  const prefix = stripAddressLabelPrefix(normalized.slice(0, addressDetail.index));
  return normalizeAddressLabel(prefix);
}

function normalizeAddressLabel(label: string | undefined): string | undefined {
  if (!label) {
    return undefined;
  }

  const normalized = stripAddressLabelPrefix(label).replace(/[:,-]+$/g, "").trim();
  if (
    normalized.length === 0 ||
    normalized.length > 48 ||
    normalized.split(/\s+/).length > 5 ||
    new RegExp(ADDRESS_PLACEHOLDER_PATTERN, "i").test(normalized) ||
    new RegExp(NON_ADDRESS_SURFACE_PATTERN, "i").test(normalized) ||
    looksLikeUnit(normalized)
  ) {
    return undefined;
  }

  return normalized;
}

function stripAddressLabelPrefix(value: string): string {
  let label = normalizeText(value).replace(/^[\s:,-]+|[\s:,-]+$/g, "");
  for (let index = 0; index < 4; index += 1) {
    const next = label
      .replace(/^(?:selected|default|current)\b[\s:,-]*/i, "")
      .replace(/^deliver(?:ing)?\s+(?:to|here)\b[\s:,-]*/i, "")
      .replace(/^delivery\s+(?:to|at)\b[\s:,-]*/i, "")
      .replace(/^address(?:\s+selected)?\b[\s:,-]*/i, "")
      .replace(/^saved\s+addresses?\b[\s:,-]*/i, "")
      .trim();
    if (next === label) {
      return next;
    }

    label = next;
  }

  return label;
}

function addressTextMatchesQuery(text: string, queryText: string): boolean {
  const normalizedText = normalizeText(text).toLowerCase();
  const normalizedQuery = normalizeText(queryText).toLowerCase();
  if (!normalizedText || !normalizedQuery) {
    return false;
  }

  const queryTerms = addressMatchTerms(normalizedQuery);
  if (queryTerms.length === 0) {
    return false;
  }

  if (queryTerms.length > 1 && addressPhraseMatches(normalizedText, normalizedQuery)) {
    return true;
  }

  const textTerms = addressMatchTerms(normalizedText);
  return queryTerms.every((queryTerm) =>
    textTerms.some((textTerm) => textTerm === queryTerm || (queryTerm.length >= 3 && textTerm.startsWith(queryTerm)))
  );
}

function addressPhraseMatches(text: string, query: string): boolean {
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(text);
}

function addressMatchTerms(text: string): string[] {
  return normalizeText(text)
    .toLowerCase()
    .match(/[a-z0-9]+/g) ?? [];
}

export async function startAddAddress(page: Page): Promise<void> {
  await gotoZepto(page);

  if (await isVisibleAddAddressFlow(page)) {
    return;
  }

  if (await clickAddressManagerButton(page)) {
    await page.waitForTimeout(800);
    await assertNoAccessChallenge(page);
    if (await isVisibleAddAddressFlow(page)) {
      return;
    }
  }

  const clicked = await clickAddAddressButton(page);
  if (!clicked) {
    throw new UserFacingError("Could not find an add-address action.", {
      code: "add_address_unavailable",
      hint: "Use the visible browser to add or edit your address manually."
    });
  }

  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  await assertNoAccessChallenge(page);
  if (!(await isVisibleAddAddressFlow(page))) {
    throw new UserFacingError("Zepto did not expose the add-address flow after clicking add address.", {
      code: "add_address_flow_unverified",
      hint: "Rerun with `--visible` to inspect Zepto's address UI, or add the address manually in the browser."
    });
  }
}

async function isVisibleAddAddressFlow(page: Page): Promise<boolean> {
  const bodyText = await page.locator("body").innerText().catch(() => "");
  return isAddAddressFlowText(bodyText);
}

export async function clickAddAddressButton(page: Page): Promise<boolean> {
  const controls = page.locator("button, [role='button'], a");
  for (const label of ADD_ADDRESS_CLICK_LABELS) {
    const candidates = [
      page.getByRole("button", { name: label }),
      page.getByRole("link", { name: label }),
      controls.filter({ hasText: label })
    ];

    for (const candidate of candidates) {
      if (await clickFirstSafeAddAddressControl(candidate)) {
        return true;
      }
    }
  }

  return false;
}

async function clickFirstSafeAddAddressControl(locator: Locator): Promise<boolean> {
  for await (const candidate of iterateLocatorCandidates(locator, ADDRESS_CONTROL_SCAN_LIMIT)) {
    if (await clickSafeAddAddressControl(candidate)) {
      return true;
    }
  }

  return false;
}

async function clickSafeAddAddressControl(locator: Locator): Promise<boolean> {
  if (!(await isSafeAddAddressControl(locator))) {
    return false;
  }

  await scrollControlIntoViewIfNeeded(locator);

  if (!(await isSafeAddAddressControl(locator))) {
    return false;
  }

  await locator.click();
  return true;
}

async function isSafeAddAddressControl(locator: Locator): Promise<boolean> {
  if (!(await locator.isVisible().catch(() => false))) {
    return false;
  }

  const labels = await readControlLabels(locator);
  if (labels.some(isUnsafeAddressAutomationClickText)) {
    return false;
  }

  if (!labels.some(isAddAddressClickText)) {
    return false;
  }

  if (await isDisabledControl(locator)) {
    return false;
  }

  return true;
}

export function isAddAddressClickText(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized || isUnsafeAddressAutomationClickText(normalized)) {
    return false;
  }

  return ADD_ADDRESS_CLICK_LABELS.some((label) => label.test(normalized));
}

export function isAddressManagerClickText(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized || isUnsafeAddressAutomationClickText(normalized)) {
    return false;
  }

  return ADDRESS_MANAGER_CLICK_LABELS.some((label) => label.test(normalized)) || isLikelyAddressText(normalized);
}

export function isUserLocationConsentText(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized) {
    return false;
  }

  return new RegExp(ADDRESS_LOCATION_CONSENT_SURFACE_PATTERN, "i").test(
    normalized
  );
}

export function isUnsafeAddressAutomationClickText(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized) {
    return false;
  }

  return (
    isUserLocationConsentText(normalized) ||
    isPaymentMethodLabelText(normalized) ||
    isFinalPaymentOrOrderActionText(normalized) ||
    new RegExp(ADDRESS_FINAL_CONFIRMATION_SURFACE_PATTERN, "i").test(normalized) ||
    new RegExp(ADDRESS_UNRELATED_CLICK_SURFACE_PATTERN, "i").test(normalized) ||
    /\b(save|confirm|continue|proceed|done|submit)\b/i.test(
      normalized
    )
  );
}

export function isAddAddressFlowText(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized) {
    return false;
  }

  return /\b(add new address|enter complete address|enter address details|house\s*\/?\s*flat|house no|flat no|building|floor|receiver name|pin your location|mark as home|mark as work)\b/i.test(
    normalized
  );
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
