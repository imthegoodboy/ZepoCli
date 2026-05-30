import type { Locator, Page } from "playwright";

import type { CartSnapshot } from "../types.js";
import { UserFacingError } from "../utils/errors.js";
import { extractPrices, normalizeText } from "../utils/format.js";
import { textMatchesProductQuery } from "../utils/product-matching.js";
import { parseCartItemsFromText } from "./extract.js";
import { assertNoAccessChallenge, gotoZepto } from "./browser.js";
import { isDisabledControl, readControlLabels } from "./control-state.js";
import { isPaymentMethodLabelText, PAYMENT_METHOD_LABEL_PATTERN_SOURCE } from "./payment-labels.js";

export const CART_OPEN_CLICK_LABELS = [/^cart$/i, /^my cart$/i, /^view cart$/i, /^go to cart$/i] as const;
const CART_OPEN_CONTROL_SCAN_LIMIT = 8;
const CART_REMOVE_CONTROL_PATTERN_SOURCE = "\\b(remove|delete|decrease)\\b|^[-−]$|^(?:qty|quantity)\\s*[-−]$";
const CART_REMOVE_UNSAFE_CONTROL_PATTERN_SOURCE =
  `\\b(add more|add coupon|apply coupon|coupon|promo|voucher|view bill|bill summary|item total|grand total|to pay|checkout|proceed|continue|payment|pay|place order|confirm order|address|location|save for later|saved for later|clear cart)\\b|${PAYMENT_METHOD_LABEL_PATTERN_SOURCE}|^\\+$|^(?:qty|quantity)\\s*\\+$`;

export async function openCart(page: Page): Promise<void> {
  await gotoZepto(page, "/cart");

  const bodyText = await page.locator("body").innerText().catch(() => "");
  if (isCartPageText(bodyText)) {
    return;
  }

  await gotoZepto(page);
  const opened = await clickCartOpenButton(page);
  if (!opened) {
    throw new UserFacingError("Could not open the Zepto cart.", {
      code: "cart_unavailable",
      hint: "Log in and add an item first, then rerun the command."
    });
  }

  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  await assertNoAccessChallenge(page);
  const openedText = await page.locator("body").innerText().catch(() => "");
  if (!isCartPageText(openedText)) {
    throw new UserFacingError("Could not confirm the Zepto cart page after opening cart.", {
      code: "cart_navigation_unverified",
      hint: "Rerun with `--visible` to inspect Zepto's cart navigation before changing cart contents."
    });
  }
}

export async function clickCartOpenButton(page: Page): Promise<boolean> {
  const controls = page.locator("button, [role='button'], a");
  for (const label of CART_OPEN_CLICK_LABELS) {
    const candidates = [
      page.getByRole("button", { name: label }),
      page.getByRole("link", { name: label }),
      controls.filter({ hasText: label })
    ];

    for (const candidate of candidates) {
      if (await clickFirstSafeCartOpenControl(candidate)) {
        return true;
      }
    }
  }

  return false;
}

async function clickFirstSafeCartOpenControl(locator: Locator): Promise<boolean> {
  for await (const candidate of iterateLocatorCandidates(locator, CART_OPEN_CONTROL_SCAN_LIMIT)) {
    if (await clickSafeCartOpenControl(candidate)) {
      return true;
    }
  }

  return false;
}

async function clickSafeCartOpenControl(locator: Locator): Promise<boolean> {
  if (!(await locator.isVisible().catch(() => false))) {
    return false;
  }

  const labels = await readControlLabels(locator);
  if (labels.some(isUnsafeCartOpenClickText)) {
    return false;
  }

  if (!labels.some(isCartOpenClickText)) {
    return false;
  }

  if (await isDisabledControl(locator)) {
    return false;
  }

  await locator.click();
  return true;
}

export async function readCart(page: Page): Promise<CartSnapshot> {
  await openCart(page);
  return readVisibleCart(page);
}

export async function removeCartItem(page: Page, query: string): Promise<CartSnapshot> {
  await openCart(page);

  let removed = false;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const removeId = await findRemoveButtonId(page, query);
    if (removeId === undefined) {
      break;
    }

    await clickTaggedCartRemoveButton(page, removeId, query);
    removed = true;
    await page.waitForTimeout(700);
    await assertNoAccessChallenge(page);
  }

  if (!removed) {
    throw new UserFacingError(`Could not find a removable cart item matching "${query}".`, {
      code: "cart_item_not_found"
    });
  }

  const cart = await readCart(page);
  if (cartHasMatchingItem(cart, query)) {
    throw new UserFacingError(`Zepto still shows a cart item matching "${query}" after remove.`, {
      code: "cart_remove_unverified",
      hint: "Rerun with `--visible` to inspect the cart controls before retrying checkout."
    });
  }

  return cart;
}

export async function clearCart(page: Page): Promise<CartSnapshot> {
  await openCart(page);

  let cart = await readVisibleCart(page);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const target = cart.items[0];
    if (!target) {
      return cart;
    }

    const targetQueries = [
      [target.name, target.unit].filter(Boolean).join(" "),
      target.name
    ].filter((query, index, queries) => query && queries.indexOf(query) === index);

    let removeId: number | undefined;
    let removeQuery: string | undefined;
    for (const targetQuery of targetQueries) {
      removeId = await findRemoveButtonId(page, targetQuery);
      if (removeId !== undefined) {
        removeQuery = targetQuery;
        break;
      }
    }

    if (removeId === undefined) {
      break;
    }

    await clickTaggedCartRemoveButton(page, removeId, removeQuery);
    await page.waitForTimeout(500);
    await assertNoAccessChallenge(page);
    cart = await readVisibleCart(page);
  }

  if (cart.items.length > 0) {
    throw new UserFacingError("Could not clear all detected Zepto cart items.", {
      code: "cart_clear_incomplete",
      hint: "Rerun with `--visible` to inspect Zepto's cart controls, or remove the remaining items in the browser."
    });
  }

  return cart;
}

export function cartHasMatchingItem(cart: CartSnapshot, query: string): boolean {
  return cart.items.some((item) => {
    const itemText = [item.name, item.unit].filter(Boolean).join(" ");
    return textMatchesProductQuery(itemText, query);
  });
}

export function isCartPageText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return false;
  }

  if (parseCartItemsFromText(text).length > 0) {
    return hasCartSurfaceEvidence(normalized);
  }

  if (isEmptyCartText(normalized)) {
    return true;
  }

  const cartTextWithoutAddControls = stripAddToCartControls(normalized);
  return (
    /\b(view bill|to pay|grand total|item total|bill summary)\b/i.test(normalized) &&
    (/\b(my cart|coupon|delivery address|add more|[1-9]\d*\s+items?)\b/i.test(normalized) ||
      /\bcart\b/i.test(cartTextWithoutAddControls))
  );
}

export function requireReadableCartSnapshot(rawText: string): CartSnapshot {
  const snapshot = {
    items: parseCartItemsFromText(rawText),
    total: extractCartTotal(rawText),
    rawText
  };

  if (snapshot.items.length > 0 && hasCartSurfaceEvidence(rawText)) {
    return snapshot;
  }

  if (isEmptyCartText(rawText) && !hasNonEmptyCartEvidence(rawText)) {
    return snapshot;
  }

  throw new UserFacingError("Zepto cart page did not expose readable cart items.", {
    code: "cart_unreadable",
    hint: "Rerun with `--visible` to inspect Zepto's cart page before treating the cart as empty."
  });
}

export function isEmptyCartText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return false;
  }

  return /\b(cart is empty|cart empty|empty cart|your cart is empty|no items in cart|no items added)\b/i.test(
    normalized
  );
}

export function isCartOpenClickText(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized) {
    return false;
  }

  return CART_OPEN_CLICK_LABELS.some((label) => label.test(normalized));
}

export function isUnsafeCartOpenClickText(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized) {
    return false;
  }

  if (/^(go|open|next|submit)$/i.test(normalized)) {
    return true;
  }

  return (
    /\b(checkout|proceed|continue|payment|pay|make payment|place order|confirm order|view bill|bill summary|item total|grand total|to pay)\b/i.test(
      normalized
    ) || isPaymentMethodLabelText(normalized)
  );
}

export function isCartRemoveControlText(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized) {
    return false;
  }

  return new RegExp(CART_REMOVE_CONTROL_PATTERN_SOURCE, "i").test(normalized);
}

export function isUnsafeCartRemoveControlText(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized) {
    return false;
  }

  return new RegExp(CART_REMOVE_UNSAFE_CONTROL_PATTERN_SOURCE, "i").test(normalized);
}

export function hasCartSurfaceEvidence(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized) {
    return false;
  }

  const cartTextWithoutAddControls = stripAddToCartControls(normalized);
  return (
    /\b(my cart|view bill|bill summary|item total|grand total|to pay|qty|quantity|remove|delete|decrease)\b/i.test(
      normalized
    ) || /\bcart\b/i.test(cartTextWithoutAddControls)
  );
}

function stripAddToCartControls(text: string): string {
  return text.replace(/\badd(?:\s+to)?\s+cart\b/gi, " ");
}

export function isLikelyRemovableCartItemText(text: string, query?: string): boolean {
  const normalized = normalizeText(text).toLowerCase();
  if (!normalized || !/[₹]|rs\.?\s*\d/i.test(normalized)) {
    return false;
  }

  if (isCartSummaryOrFeeText(normalized)) {
    return false;
  }

  if (isNonCartProductSurfaceText(normalized)) {
    return false;
  }

  if (!hasCartMutationSignal(normalized)) {
    return false;
  }

  if (!query) {
    return true;
  }

  return textMatchesProductQuery(normalized, query);
}

async function findRemoveButtonId(page: Page, query?: string): Promise<number | undefined> {
  return page.evaluate(({ itemQuery, removeControlPatternSource, unsafeRemoveControlPatternSource }) => {
    const removeControlPattern = new RegExp(removeControlPatternSource, "i");
    const unsafeRemoveControlPattern = new RegExp(unsafeRemoveControlPatternSource, "i");
    const sizeUnitPattern =
      "ml|l|ltr|litre|litres|liter|liters|g|gm|gms|gram|grams|kg|kgs|pc|pcs|piece|pieces|pack|packs|packet|packets|bottle|bottles|box|boxes|can|cans|jar|jars|pouch|pouches|sachet|sachets|dozen|tablet|tablets|tabs|capsule|capsules";
    const normalize = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();
    const normalizeProductMatchText = (value: string) =>
      normalize(value)
        .replace(new RegExp(`(\\d+(?:\\.\\d+)?)\\s+(?=(?:${sizeUnitPattern})\\b)`, "gi"), "$1")
        .replace(/(\d+(?:\.\d+)?)(?:litres?|liters?|ltr)\b/gi, "$1l")
        .replace(/(\d+(?:\.\d+)?)(?:grams?|gms?|gm)\b/gi, "$1g")
        .replace(/(\d+(?:\.\d+)?)kgs\b/gi, "$1kg")
        .replace(/(\d+(?:\.\d+)?)(?:pieces?|pcs?)\b/gi, "$1pc");
    const compactProductMatchText = (value: string) => value.replace(/[^a-z0-9.]+/gi, "");
    const productMatchTerms = (value: string) =>
      normalizeProductMatchText(value)
        .split(/[^a-z0-9.]+/i)
        .filter((term) => term.length > 1);
    const productMatchPhraseMatches = (text: string, queryText: string) => {
      const escaped = queryText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
      return new RegExp(`(^|[^a-z0-9.])${escaped}(?=$|[^a-z0-9.])`, "i").test(text);
    };
    const productMatchTermVariants = (term: string) => {
      const variants = [term];
      if (/^[a-z]{4,}ies$/i.test(term)) {
        variants.push(`${term.slice(0, -3)}y`);
      } else if (/^[a-z]{4,}s$/i.test(term)) {
        variants.push(term.slice(0, -1));
      }
      return variants;
    };
    const productMatchTermVariantMatches = (searchableTerms: string[], compactSearchable: string, variant: string) => {
      if (/^[a-z]+$/i.test(variant)) {
        return searchableTerms.some(
          (term) => term === variant || (variant.length >= 3 && term.startsWith(variant))
        );
      }

      return searchableTerms.includes(variant) || (/\d/.test(variant) && compactSearchable.includes(variant));
    };
    const productMatchTermMatches = (searchableTerms: string[], compactSearchable: string, term: string) =>
      productMatchTermVariants(term).some((variant) =>
        productMatchTermVariantMatches(searchableTerms, compactSearchable, variant)
      );
    const textMatchesProductQuery = (text: string, query: string) => {
      const searchable = normalizeProductMatchText(text);
      const queryText = normalizeProductMatchText(query);
      if (!searchable || !queryText) {
        return false;
      }

      const compactSearchable = compactProductMatchText(searchable);
      const compactQuery = compactProductMatchText(queryText);
      const searchableTerms = productMatchTerms(searchable);
      if (queryText.includes(" ") && productMatchPhraseMatches(searchable, queryText)) {
        return true;
      }

      if (compactQuery.length > 1 && /\d/.test(compactQuery) && compactSearchable.includes(compactQuery)) {
        return true;
      }

      const terms = productMatchTerms(queryText);
      return terms.length > 0
        ? terms.every((term) => productMatchTermMatches(searchableTerms, compactSearchable, term))
        : false;
    };
    const isSummaryOrFeeText = (text: string) =>
      /\b(apply coupon|coupon|bill summary|item total|grand total|to pay|delivery fee|delivery charge|handling fee|platform fee|surge fee|discount|savings|taxes?)\b/i.test(
        text
      );
    const isNonCartProductSurfaceText = (text: string) =>
      /\b(recommended|you may also like|frequently bought|similar products|popular picks|sponsored|ad|add more|saved for later|before you checkout|complete your cart|customers also bought)\b/i.test(
        text
      );
    const hasCartMutationSignal = (text: string) =>
      /\b(qty|quantity|remove|delete|decrease)\b/i.test(text) ||
      /(?:^|\s)x\s*\d+\b/i.test(text) ||
      /\b\d+\s*x(?:\s|$)/i.test(text) ||
      /[+\-−]\s*\d+\b/.test(text) ||
      /\b\d+\s*[+\-−]/.test(text);
    const isLikelyRemovableItemText = (text: string) =>
      /[₹]|rs\.?\s*\d/i.test(text) &&
      !isSummaryOrFeeText(text) &&
      !isNonCartProductSurfaceText(text) &&
      hasCartMutationSignal(text) &&
      (!itemQuery || textMatchesProductQuery(text, itemQuery));
    const referencedLabelText = (element: Element) =>
      `${element.getAttribute("aria-labelledby") ?? ""} ${element.getAttribute("aria-describedby") ?? ""}`
        .split(/\s+/)
        .map((id) => id.trim())
        .filter(Boolean)
        .map((id) => element.ownerDocument.getElementById(id)?.textContent ?? "");
    const controlLabels = (element: Element) =>
      [
        element.textContent ?? "",
        element.getAttribute("aria-label") ?? "",
        element.getAttribute("title") ?? "",
        element.getAttribute("placeholder") ?? "",
        element.getAttribute("value") ?? "",
        element.getAttribute("aria-description") ?? "",
        ...referencedLabelText(element)
      ]
        .map(normalize)
        .filter(Boolean);
    const isRemoveButton = (element: Element) => {
      const labels = controlLabels(element);
      return labels.some((label) => removeControlPattern.test(label)) && !labels.some((label) => unsafeRemoveControlPattern.test(label));
    };
    const hasDisabledState = (element: Element) => {
      const dataDisabled = element.getAttribute("data-disabled");
      return (
        element.hasAttribute("disabled") ||
        element.getAttribute("aria-disabled")?.toLowerCase() === "true" ||
        (dataDisabled !== null && dataDisabled.toLowerCase() !== "false")
      );
    };
    const isClickableElement = (element: Element) => {
      if (
        element instanceof HTMLButtonElement ||
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
      ) {
        if (element.disabled) {
          return false;
        }
      }

      for (let current: Element | null = element; current; current = current.parentElement) {
        if (hasDisabledState(current)) {
          return false;
        }
      }

      if (element.closest("fieldset[disabled]")) {
        return false;
      }

      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const cardFor = (element: Element) => {
      let current: Element | null = element;
      for (let depth = 0; current && depth < 8; depth += 1) {
        const text = current.textContent ?? "";
        if (text.includes("₹") && text.length < 1500) {
          return current;
        }
        current = current.parentElement;
      }
      return element;
    };

    document
      .querySelectorAll("[data-zepo-remove-id]")
      .forEach((element) => element.removeAttribute("data-zepo-remove-id"));

    const candidates = Array.from(document.querySelectorAll("button, [role='button']")).filter(
      (button) => isClickableElement(button) && isRemoveButton(button)
    );
    for (const [index, button] of candidates.entries()) {
      const controlText = normalize(controlLabels(button).join(" "));
      const cardText = normalize(`${cardFor(button).textContent ?? ""} ${controlText}`);
      if (isLikelyRemovableItemText(cardText)) {
        button.setAttribute("data-zepo-remove-id", String(index));
        return index;
      }
    }

    return undefined;
  }, {
    itemQuery: query,
    removeControlPatternSource: CART_REMOVE_CONTROL_PATTERN_SOURCE,
    unsafeRemoveControlPatternSource: CART_REMOVE_UNSAFE_CONTROL_PATTERN_SOURCE
  });
}

export async function clickTaggedCartRemoveButton(page: Page, removeId: number, query?: string): Promise<void> {
  const button = page.locator(`[data-zepo-remove-id="${removeId}"]`).first();
  if (!(await button.isVisible().catch(() => false))) {
    throw new UserFacingError("Zepto cart remove control changed before it could be clicked.", {
      code: "cart_remove_control_unavailable",
      hint: "Rerun with `--visible` to inspect the current cart controls before retrying."
    });
  }

  if (await isDisabledControl(button)) {
    throw new UserFacingError("Zepto cart remove control is disabled.", {
      code: "cart_remove_control_disabled",
      hint: "The item may no longer be removable from the current cart state. Rerun `zepo cart` or inspect with `--visible`."
    });
  }

  const labels = await readControlLabels(button);
  if (!labels.some(isCartRemoveControlText) || labels.some(isUnsafeCartRemoveControlText)) {
    throw new UserFacingError("Zepto cart remove control no longer appears to be a safe item remove action.", {
      code: "cart_remove_control_stale",
      hint: "Rerun `zepo cart` or inspect with `--visible`; Zepto may have re-rendered or changed the cart controls."
    });
  }

  const cardText = String(await button.evaluate(readClosestCartRemoveCardText).catch(() => ""));
  if (!isLikelyRemovableCartItemText(cardText, query)) {
    throw new UserFacingError("Zepto cart remove control no longer matches a removable cart item.", {
      code: "cart_remove_control_stale",
      hint: "Rerun `zepo cart` or inspect with `--visible`; Zepto may have re-rendered or reordered the cart."
    });
  }

  await button.click();
}

function readClosestCartRemoveCardText(element: Element): string {
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
  const visibleText = (target: Element) =>
    target instanceof HTMLElement ? normalize(target.innerText) : normalize(target.textContent ?? "");
  const referencedLabelText = (target: Element) =>
    `${target.getAttribute("aria-labelledby") ?? ""} ${target.getAttribute("aria-describedby") ?? ""}`
      .split(/\s+/)
      .map((id) => id.trim())
      .filter(Boolean)
      .map((id) => target.ownerDocument.getElementById(id)?.textContent ?? "")
      .join(" ");
  const controlText = normalize(
    `${element.textContent ?? ""} ${element.getAttribute("aria-label") ?? ""} ${element.getAttribute("title") ?? ""} ${element.getAttribute("placeholder") ?? ""} ${element.getAttribute("value") ?? ""} ${element.getAttribute("aria-description") ?? ""} ${referencedLabelText(element)}`
  );

  let current: Element | null = element;
  for (let depth = 0; current && depth < 8; depth += 1) {
    const text = visibleText(current);
    if (text.length > 0 && text.length < 1500 && /[₹]|rs\.?\s*\d/i.test(text)) {
      return normalize(`${text} ${controlText}`);
    }

    current = current.parentElement;
  }

  return normalize(`${visibleText(element)} ${controlText}`);
}

async function readVisibleCart(page: Page): Promise<CartSnapshot> {
  await assertNoAccessChallenge(page);

  const rawText = await page.locator("body").innerText();
  return requireReadableCartSnapshot(rawText);
}

function extractCartTotal(rawText: string): string | undefined {
  const lines = rawText.split(/\r?\n/).map((line) => line.trim());
  return (
    extractLabeledCartTotal(lines, isPrimaryCartTotalLabel) ??
    extractLabeledCartTotal(lines, isFinalCartTotalLabel) ??
    extractLabeledCartTotal(lines, isFallbackCartTotalLabel)
  );
}

function extractLabeledCartTotal(lines: string[], matchesTotalLabel: (label: string) => boolean): string | undefined {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const sameLineTotal = extractCartTotalPriceAfterLabel(line, matchesTotalLabel);
    if (sameLineTotal) {
      return sameLineTotal;
    }

    if (!matchesTotalLabel(line)) {
      continue;
    }

    for (let offset = 1; offset <= 2; offset += 1) {
      const candidate = lines[index + offset] ?? "";
      if (!candidate || isCartTotalStopLine(candidate)) {
        break;
      }

      const prices = extractPrices(candidate);
      if (prices.length > 0) {
        return prices.at(-1);
      }
    }
  }

  return undefined;
}

function extractCartTotalPriceAfterLabel(line: string, matchesTotalLabel: (line: string) => boolean): string | undefined {
  const words = line.split(/\s+/);
  for (let start = 0; start < words.length; start += 1) {
    for (let end = start + 1; end <= words.length; end += 1) {
      const candidateLabel = words.slice(start, end).join(" ");
      if (!matchesTotalLabel(candidateLabel)) {
        continue;
      }

      const suffix = words
        .slice(end)
        .join(" ")
        .replace(/^[:=\-–—]+/, "")
        .trim();
      if (!startsWithPrice(suffix)) {
        continue;
      }

      const price = extractPrices(suffix)[0];
      if (price) {
        return price;
      }
    }
  }

  return undefined;
}

function isPrimaryCartTotalLabel(label: string): boolean {
  return /^(to pay|grand total|payable|bill total|amount payable|order total)$/i.test(normalizeTotalLabel(label));
}

function isFinalCartTotalLabel(label: string): boolean {
  return /^total$/i.test(normalizeTotalLabel(label));
}

function isFallbackCartTotalLabel(label: string): boolean {
  return /^(item total|subtotal)$/i.test(normalizeTotalLabel(label));
}

function startsWithPrice(value: string): boolean {
  return /^(₹\s?[\d,]+(?:\.\d+)?|(?:rs\.?|inr)\s?[\d,]+(?:\.\d+)?)/i.test(value);
}

function normalizeTotalLabel(label: string): string {
  return normalizeText(label).replace(/[:=\-–—]+$/, "").trim();
}

function isCartTotalStopLine(line: string): boolean {
  return /\b(delivery|handling|platform|convenience|surge|small cart|fee|charge|coupon|discount|saving|wallet|tip|donation|tax|packing|packaging|address|cart|qty|quantity|remove|delete|item total|subtotal|to pay|grand total|payable|bill total)\b/i.test(
    line
  );
}

function hasNonEmptyCartEvidence(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized) {
    return false;
  }

  return /\b([1-9]\d*\s+items?|view bill|bill summary|item total|grand total|to pay|payable|checkout|proceed to checkout|qty|quantity|remove|delete|decrease)\b/i.test(
    normalized
  );
}

function isCartSummaryOrFeeText(text: string): boolean {
  return /\b(apply coupon|coupon|bill summary|item total|grand total|to pay|delivery fee|delivery charge|handling fee|platform fee|surge fee|discount|savings|taxes?)\b/i.test(
    text
  );
}

function isNonCartProductSurfaceText(text: string): boolean {
  return /\b(recommended|you may also like|frequently bought|similar products|popular picks|sponsored|ad|add more|saved for later|before you checkout|complete your cart|customers also bought)\b/i.test(
    text
  );
}

function hasCartMutationSignal(text: string): boolean {
  return (
    /\b(qty|quantity|remove|delete|decrease)\b/i.test(text) ||
    /(?:^|\s)x\s*\d+\b/i.test(text) ||
    /\b\d+\s*x(?:\s|$)/i.test(text) ||
    /[+\-−]\s*\d+\b/.test(text) ||
    /\b\d+\s*[+\-−]/.test(text)
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
