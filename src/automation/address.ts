import type { Locator, Page } from "playwright";

import type { Address } from "../types.js";
import { UserFacingError } from "../utils/errors.js";
import { looksLikeUnit, normalizeText } from "../utils/format.js";
import { assertNoAccessChallenge, gotoZepto } from "./browser.js";
import { isDisabledControl, readControlLabels } from "./control-state.js";

const ADDRESS_DETAIL_PATTERN =
  "\\b(house|flat|road|street|sector|phase|apartment|building|floor|tower|block|pin|pincode|india|bengaluru|bangalore|mumbai|delhi|pune|hyderabad|chennai|kolkata|ahmedabad|gurugram|gurgaon|noida)\\b|\\d{3,}";
const ADDRESS_PLACEHOLDER_PATTERN =
  "^(add|select|enter|use|choose|set|change)\\b.*\\b(address|location)\\b|^(delivery address|saved addresses|select location|add address)$";
const ADDRESS_LOCATION_CONSENT_SURFACE_PATTERN =
  "\\b(use (?:my |your |device )?current location|use device location|allow (?:browser |precise )?location|allow location access|share (?:my |your |current |device )?location|detect (?:my |your |current |device )?location|get current location|find (?:my |your |current )?location|enable (?:browser |precise )?location|enable location services|use precise location|grant location access|turn on location|locate me|use gps|enter current location)\\b";
const ADDRESS_FINAL_CONFIRMATION_SURFACE_PATTERN =
  "\\b(confirm address|confirm location|save\\s+(?:&|and)\\s+(?:continue|proceed)|save address|use this address|deliver here|select this location)\\b";
const NON_ADDRESS_SURFACE_PATTERN =
  `\\b(add|cart|checkout|order summary|bill summary|item total|grand total|to pay|coupon|delivery fee|recommended|sponsored|popular picks|you may also like|out of stock)\\b|₹|\\brs\\.?\\s?\\d|\\binr\\s?\\d|${ADDRESS_LOCATION_CONSENT_SURFACE_PATTERN}|${ADDRESS_FINAL_CONFIRMATION_SURFACE_PATTERN}`;
export const ADDRESS_MANAGER_CLICK_LABELS = [
  /^deliver(?:ing)? to\b.*$/i,
  /^select location$/i,
  /^delivery address$/i,
  /^saved addresses$/i
] as const;
export const ADD_ADDRESS_CLICK_LABELS = [
  /^add new$/i,
  /^add address$/i,
  /^add new address$/i,
  /^enter\s+(?:delivery\s+)?location$/i
] as const;

export interface AddressSelectionCandidate {
  index: number;
  text: string;
  label?: string;
}

export async function openAddressManager(page: Page): Promise<void> {
  await gotoZepto(page);

  const clicked = await clickAddressManagerButton(page);

  if (!clicked) {
    throw new UserFacingError("Could not open Zepto address controls.", {
      code: "address_controls_unavailable",
      hint: "Open `zepo login` first and confirm your location/address in the browser."
    });
  }

  await page.waitForTimeout(800);
  await assertNoAccessChallenge(page);
}

export async function clickAddressManagerButton(page: Page): Promise<boolean> {
  const controls = page.locator("button, [role='button'], a");
  for (const label of ADDRESS_MANAGER_CLICK_LABELS) {
    const candidates = [
      page.getByRole("button", { name: label }).first(),
      page.getByRole("link", { name: label }).first(),
      controls.filter({ hasText: label }).first()
    ];

    for (const candidate of candidates) {
      if (await clickSafeAddressManagerControl(candidate)) {
        return true;
      }
    }
  }

  return false;
}

async function clickSafeAddressManagerControl(locator: Locator): Promise<boolean> {
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

  await locator.click();
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

  return filterAddressTexts(addressTexts).slice(0, 20).map(addressFromText);
}

export async function useAddress(page: Page, query: string): Promise<Address> {
  await openAddressManager(page);

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
    const elements = Array.from(document.querySelectorAll("button, [role='button'], li, article, section, div"));
    const candidates: Array<{ index: number; text: string; label?: string }> = [];

    for (const [index, element] of elements.entries()) {
      const text = visibleText(element);
      if (isAddressText(text) && !hasAddressDescendant(element, text)) {
        candidates.push({
          index,
          text,
          label: text.match(/\b(Home|Work|Other)\b/i)?.[1]
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

  await clickTaggedAddressSelection(page, matched);
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  await assertNoAccessChallenge(page);

  const addresses = await listAddresses(page);
  return requireSelectedAddress(addresses, query);
}

export async function clickTaggedAddressSelection(
  page: Page,
  candidate: AddressSelectionCandidate
): Promise<void> {
  const tagged = await page.evaluate(({ index, expectedText }) => {
    const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
    const visibleText = (element: Element) =>
      element instanceof HTMLElement ? normalize(element.innerText) : normalize(element.textContent ?? "");

    document
      .querySelectorAll("[data-zepo-address-id]")
      .forEach((element) => element.removeAttribute("data-zepo-address-id"));

    const elements = Array.from(document.querySelectorAll("button, [role='button'], li, article, section, div"));
    const element = elements[index];
    if (!element || visibleText(element) !== normalize(expectedText)) {
      return false;
    }

    element.setAttribute("data-zepo-address-id", String(index));
    return true;
  }, {
    index: candidate.index,
    expectedText: candidate.text
  });

  if (!tagged) {
    throw new UserFacingError("Zepto address list changed before the selected address could be clicked.", {
      code: "address_selection_stale",
      hint: "Rerun `zepo address use` after checking the current saved addresses with `zepo address list`."
    });
  }

  const locator = page.locator(`[data-zepo-address-id="${candidate.index}"]`).first();
  if (!(await locator.isVisible().catch(() => false))) {
    throw new UserFacingError("Zepto address selection control changed before it could be clicked.", {
      code: "address_selection_control_unavailable",
      hint: "Rerun `zepo address use` after checking the current saved addresses with `zepo address list`."
    });
  }

  const currentText = normalizeText(await locator.innerText().catch(() => ""));
  if (currentText !== normalizeText(candidate.text)) {
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

  await locator.click();
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
  const addressText = normalizeText([address.label, address.text].filter(Boolean).join(" ")).toLowerCase();
  return queryText.length > 0 && (addressText.includes(queryText) || queryText.includes(addressText));
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

  return candidates.filter((text) => !isAddressContainerText(text, candidates));
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
  const label = text.match(/\b(Home|Work|Other)\b/i)?.[1];
  return {
    label,
    text,
    selected: /selected|deliver(?:ing)? (?:here|to)/i.test(text)
  };
}

function isAddressContainerText(text: string, candidates: string[]): boolean {
  if (addressLabelCount(text) < 2 && !/^saved addresses?\b/i.test(text)) {
    return false;
  }

  const key = text.toLowerCase();
  return candidates.some((candidate) => candidate !== text && key.includes(candidate.toLowerCase()));
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
      label: candidate.label ? normalizeText(candidate.label) : undefined
    });
  }

  const candidateTexts = uniqueCandidates.map((candidate) => candidate.text);
  return uniqueCandidates.filter((candidate) => !isAddressContainerText(candidate.text, candidateTexts));
}

function addressSelectionCandidateMatchesQuery(candidate: AddressSelectionCandidate, queryText: string): boolean {
  const text = normalizeText(candidate.text).toLowerCase();
  const label = normalizeText(candidate.label ?? "").toLowerCase();
  return text.includes(queryText) || label === queryText;
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

function addressLabelCount(text: string): number {
  return (text.match(/\b(Home|Work|Other)\b/gi) ?? []).length;
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
      page.getByRole("button", { name: label }).first(),
      page.getByRole("link", { name: label }).first(),
      controls.filter({ hasText: label }).first()
    ];

    for (const candidate of candidates) {
      if (await clickSafeAddAddressControl(candidate)) {
        return true;
      }
    }
  }

  return false;
}

async function clickSafeAddAddressControl(locator: Locator): Promise<boolean> {
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

  await locator.click();
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

  return ADDRESS_MANAGER_CLICK_LABELS.some((label) => label.test(normalized));
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
    new RegExp(ADDRESS_FINAL_CONFIRMATION_SURFACE_PATTERN, "i").test(normalized) ||
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

  return /\b(add new address|enter complete address|enter address details|house\s*\/?\s*flat|house no|flat no|building|floor|receiver name|save address|confirm address|pin your location|mark as home|mark as work)\b/i.test(
    normalized
  );
}
