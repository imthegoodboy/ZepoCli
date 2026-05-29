import type { Locator, Page } from "playwright";

import { isEditableTextInput, readControlLabels } from "./control-state.js";

export const PHONE_PREFILL_INPUT_SELECTOR = [
  "input[type='tel']",
  "input[autocomplete='tel']",
  "input[autocomplete='tel-national']",
  "input[name*='phone' i]",
  "input[name*='mobile' i]",
  "input[id*='phone' i]",
  "input[id*='mobile' i]",
  "input[placeholder*='phone' i]",
  "input[placeholder*='mobile' i]",
  "input[aria-label*='phone' i]",
  "input[aria-label*='mobile' i]"
].join(", ");

const PHONE_PREFILL_FALLBACK_INPUT_SELECTOR = [
  "input[type='tel']",
  "input[autocomplete='tel']",
  "input[autocomplete='tel-national']",
  "input:not([type])",
  "input[type='text']",
  "input[type='number']",
  "input[inputmode='numeric']",
  "textarea"
].join(", ");

const LOGIN_FORM_INPUT_SELECTOR = [
  PHONE_PREFILL_INPUT_SELECTOR,
  "input[autocomplete='one-time-code']",
  "input[name*='otp' i]",
  "input[id*='otp' i]",
  "input[placeholder*='otp' i]",
  "input[aria-label*='otp' i]",
  "input[placeholder*='verification code' i]",
  "input[aria-label*='verification code' i]"
].join(", ");

const LOGIN_FORM_FALLBACK_INPUT_SELECTOR = [
  PHONE_PREFILL_FALLBACK_INPUT_SELECTOR,
  "input[autocomplete='one-time-code']"
].join(", ");

const DIRECT_INPUT_SCAN_LIMIT = 10;
const FALLBACK_INPUT_SCAN_LIMIT = 20;
const PAYMENT_METHOD_LABEL_PATTERN =
  /\b(payment methods?|payment options?|payment mode|select payment|choose payment|upi|cards?|credit\s*(?:\/|and)?\s*debit|debit\s*(?:\/|and)?\s*credit|credit card|debit card|wallet|net\s*banking|netbanking|cash on delivery|cod|pay on delivery|phonepe|google pay|gpay|paytm|bhim)\b/i;

export async function findPhonePrefillInput(page: Page): Promise<Locator | undefined> {
  const directInput = await findSafePhonePrefillInput(page.locator(PHONE_PREFILL_INPUT_SELECTOR), DIRECT_INPUT_SCAN_LIMIT);
  if (directInput) {
    return directInput;
  }

  return findSafePhonePrefillInput(page.locator(PHONE_PREFILL_FALLBACK_INPUT_SELECTOR), FALLBACK_INPUT_SCAN_LIMIT);
}

export async function hasVisibleLoginFormInput(page: Page): Promise<boolean> {
  if (await findLoginFormInput(page.locator(LOGIN_FORM_INPUT_SELECTOR), DIRECT_INPUT_SCAN_LIMIT)) {
    return true;
  }

  return Boolean(await findLoginFormInput(page.locator(LOGIN_FORM_FALLBACK_INPUT_SELECTOR), FALLBACK_INPUT_SCAN_LIMIT));
}

export async function isSafePhonePrefillInput(locator: Locator): Promise<boolean> {
  if (!(await locator.isVisible().catch(() => false))) {
    return false;
  }

  if (!(await isEditableTextInput(locator))) {
    return false;
  }

  const [labels, explicitAttribute] = await Promise.all([
    readControlLabels(locator),
    hasExplicitPhonePrefillAttribute(locator)
  ]);

  if (labels.some(isUnsafePhonePrefillInputText)) {
    return false;
  }

  return explicitAttribute || labels.some(isPhonePrefillInputText);
}

export function isPhonePrefillInputText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return false;
  }

  return /phone|mobile|telephone|\btel\b/i.test(normalized);
}

export function isUnsafePhonePrefillInputText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return false;
  }

  return (
    /\b(otp|one[-\s]*time|verification code|verify|pin|passcode|password|search|cart|checkout|payment|pay|address|location|coupon|orders?|order history|track order|reorder|pincode|pin code|quantity|qty)\b/i.test(
      normalized
    ) || PAYMENT_METHOD_LABEL_PATTERN.test(normalized)
  );
}

async function findSafePhonePrefillInput(locator: Locator, limit: number): Promise<Locator | undefined> {
  for await (const candidate of iterateLocatorCandidates(locator, limit)) {
    if (await isSafePhonePrefillInput(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

async function findLoginFormInput(locator: Locator, limit: number): Promise<Locator | undefined> {
  for await (const candidate of iterateLocatorCandidates(locator, limit)) {
    if (await isVisibleLoginFormInput(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

async function isVisibleLoginFormInput(locator: Locator): Promise<boolean> {
  if (!(await locator.isVisible().catch(() => false))) {
    return false;
  }

  const [labels, attributes] = await Promise.all([readControlLabels(locator), readInputAttributes(locator)]);
  if (labels.some(isLoggedInAccountText)) {
    return false;
  }

  if (hasExplicitPhonePrefillAttributeValue(attributes)) {
    return true;
  }

  if (hasOtpInputAttributeValue(attributes)) {
    return true;
  }

  return labels.some((label) => isPhonePrefillInputText(label) || isOtpInputText(label));
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

async function hasExplicitPhonePrefillAttribute(locator: Locator): Promise<boolean> {
  return hasExplicitPhonePrefillAttributeValue(await readInputAttributes(locator));
}

async function readInputAttributes(locator: Locator): Promise<Record<string, string>> {
  const [type, autocomplete, name, id] = await Promise.all([
    locator.getAttribute("type").catch(() => null),
    locator.getAttribute("autocomplete").catch(() => null),
    locator.getAttribute("name").catch(() => null),
    locator.getAttribute("id").catch(() => null)
  ]);

  return {
    type: type ?? "",
    autocomplete: autocomplete ?? "",
    name: name ?? "",
    id: id ?? ""
  };
}

function hasExplicitPhonePrefillAttributeValue(attributes: Record<string, string>): boolean {
  if ((attributes.type ?? "").toLowerCase() === "tel") {
    return true;
  }

  if (/\btel(?:-\w+)?\b/i.test(attributes.autocomplete ?? "")) {
    return true;
  }

  return /phone|mobile/i.test(`${attributes.name} ${attributes.id}`);
}

function hasOtpInputAttributeValue(attributes: Record<string, string>): boolean {
  if (/\bone-time-code\b/i.test(attributes.autocomplete ?? "")) {
    return true;
  }

  return /otp|one[-_]?time|verification[-_]?code/i.test(`${attributes.name} ${attributes.id}`);
}

function isOtpInputText(text: string): boolean {
  return /\b(otp|one[-\s]*time code|verification code|verify mobile|verify phone)\b/i.test(
    text.replace(/\s+/g, " ").trim()
  );
}

function isLoggedInAccountText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return false;
  }

  return /\b(logout|log out|my orders|order history|wallet)\b/i.test(normalized);
}
