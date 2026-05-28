import type { Locator, Page } from "playwright";

import { BASE_URL } from "../config/constants.js";
import type { Product } from "../types.js";
import { UserFacingError } from "../utils/errors.js";
import { textMatchesProductQuery } from "../utils/product-matching.js";
import { ACCESS_CHALLENGE_COOLDOWN_MS, assertNoAccessChallenge, gotoWithAccessProtection } from "./browser.js";
import { isDisabledControl, isEditableTextInput } from "./control-state.js";
import { dedupeProducts, parseProductCard, type RawProductCard } from "./extract.js";

export const SEARCH_TRIGGER_CLICK_LABELS = [
  /^search$/i,
  /^search products$/i,
  /^search for products$/i,
  /^search for groceries$/i
] as const;
const QUANTITY_CLICK_PAUSE_MS = 400;
const ADD_CLICK_SETTLE_MS = 700;
const SEARCH_INPUT_TYPE_DELAY_MS = 35;
const SEARCH_SUBMIT_PAUSE_MS = 150;

export async function searchProducts(page: Page, query: string, limit: number): Promise<Product[]> {
  const searchedFromHome = await searchFromHome(page, query);
  let attemptedDirectSearch = false;
  if (!searchedFromHome) {
    await openSearch(page, query);
    attemptedDirectSearch = true;
  }

  let products = await extractProducts(page, limit);
  if (products.length === 0 && !attemptedDirectSearch) {
    await openSearch(page, query);
    products = await extractProducts(page, limit);
  }

  if (products.length === 0) {
    const publicProducts = await searchPublicHomepageProducts(page, query, limit);
    if (publicProducts.length > 0) {
      return publicProducts;
    }

    const bodyText = await page.locator("body").innerText().catch(() => "");
    if (!bodyText.trim()) {
      throw new UserFacingError("Zepto returned an empty page during search.", {
        code: "zepto_access_protection",
        hint:
          "This usually means the site blocked or rate-limited the browser session. Stop repeated headless retries, wait before retrying, or rerun search with `--visible`.",
        retryAfterMs: ACCESS_CHALLENGE_COOLDOWN_MS
      });
    }

    if (/no results|not found/i.test(bodyText)) {
      return [];
    }

    if (isLocationSetupRequiredText(bodyText)) {
      throw new UserFacingError("Zepto needs a delivery location before search results are readable.", {
        code: "delivery_location_required",
        hint: "Run `zepo login`, then set or select a delivery location with `zepo address add` or `zepo address use <query>`."
      });
    }

    throw new UserFacingError("Zepto search did not expose readable product results.", {
      code: "search_results_unreadable",
      hint: "Set a delivery location with `zepo address add` or rerun search with `--visible`."
    });
  }

  return products.slice(0, limit);
}

export async function clickProductAdd(page: Page, product: Product): Promise<void> {
  if (product.automationId === undefined) {
    throw new UserFacingError("The selected product cannot be mapped back to an ADD button.", {
      code: "product_add_unmapped"
    });
  }

  const button = page.locator(`[data-zepo-add-id="${product.automationId}"]`).first();
  if (!(await button.isVisible().catch(() => false))) {
    throw new UserFacingError(`Could not find the ADD button for ${product.name}.`, {
      code: "product_add_unavailable",
      hint: "Run the search again. Zepto may have re-rendered the product list."
    });
  }

  if (await isDisabledControl(button)) {
    throw new UserFacingError(`The ADD button for ${product.name} is disabled.`, {
      code: "product_unavailable",
      hint: "The item may be unavailable at your current location. Rerun search with `--visible` or choose another product."
    });
  }

  await assertTaggedProductControlMatches(button, product, {
    code: "product_add_stale",
    message: `The ADD button no longer matches ${product.name}.`,
    hint: "Run the search again. Zepto may have re-rendered or reordered the product list."
  });
  await button.scrollIntoViewIfNeeded();
  await button.click();
}

export async function waitForProductAddSettled(page: Page, waitMs = ADD_CLICK_SETTLE_MS): Promise<void> {
  await page.waitForTimeout(waitMs);
  await assertNoAccessChallenge(page);
}

export async function increaseProductQuantity(page: Page, product: Product, quantity: number): Promise<void> {
  if (quantity <= 1) {
    return;
  }

  if (product.automationId === undefined) {
    throw new UserFacingError(`Could not increase ${product.name} to quantity ${quantity}.`, {
      code: "product_quantity_unavailable",
      hint: "The selected product cannot be mapped back to Zepto quantity controls."
    });
  }

  const button = page.locator(`[data-zepo-add-id="${product.automationId}"]`).first();

  for (let count = 1; count < quantity; count += 1) {
    await assertTaggedProductControlMatches(button, product, {
      code: "product_quantity_stale",
      message: `The quantity controls no longer match ${product.name}.`,
      hint: "Run the search again. Zepto may have re-rendered or reordered the product list."
    });

    const card = button.locator("xpath=ancestor::*[contains(., '₹')][1]");
    const plus = card
      .locator("button, [role='button']")
      .filter({ hasText: /^\+$/ })
      .last();

    if (!(await plus.isVisible().catch(() => false))) {
      throw new UserFacingError(`Could not increase ${product.name} to quantity ${quantity}.`, {
        code: "product_quantity_unavailable",
        hint: "Zepto did not expose a plus control after adding the item. Open the cart with `zepo cart` and retry with a lower quantity."
      });
    }

    if (await isDisabledControl(plus)) {
      throw new UserFacingError(`Could not increase ${product.name} to quantity ${quantity}.`, {
        code: "product_quantity_unavailable",
        hint: "Zepto exposed a disabled quantity control, so the requested quantity may not be available."
      });
    }

    await plus.click();
    await page.waitForTimeout(QUANTITY_CLICK_PAUSE_MS);
    await assertNoAccessChallenge(page);
  }
}

async function openSearch(page: Page, query: string): Promise<void> {
  const searchUrl = new URL("/search", BASE_URL);
  searchUrl.searchParams.set("query", query);
  await gotoWithAccessProtection(page, searchUrl);
}

async function searchFromHome(page: Page, query: string): Promise<boolean> {
  await gotoWithAccessProtection(page, BASE_URL);

  const directInput = page
    .locator("input[type='search'], input[placeholder*='Search' i], input[aria-label*='Search' i]")
    .first();

  if ((await directInput.isVisible().catch(() => false)) && (await isEditableTextInput(directInput))) {
    await submitSearchInput(page, directInput, query);
    return true;
  }

  if (await clickSearchTrigger(page)) {
    const inputAfterClick = page
      .locator("input[type='search'], input[placeholder*='Search' i], input[aria-label*='Search' i]")
      .first();
    if (!(await inputAfterClick.isVisible().catch(() => false))) {
      return false;
    }

    if (!(await isEditableTextInput(inputAfterClick))) {
      return false;
    }

    await submitSearchInput(page, inputAfterClick, query);
    return true;
  }

  return false;
}

export async function clickSearchTrigger(page: Page): Promise<boolean> {
  const controls = page.locator("button, [role='button'], a");
  for (const label of SEARCH_TRIGGER_CLICK_LABELS) {
    const candidates = [
      page.getByRole("button", { name: label }).first(),
      page.getByRole("link", { name: label }).first(),
      controls.filter({ hasText: label }).first()
    ];

    for (const candidate of candidates) {
      if (await clickSafeSearchTrigger(candidate)) {
        return true;
      }
    }
  }

  return false;
}

async function clickSafeSearchTrigger(locator: Locator): Promise<boolean> {
  if (!(await locator.isVisible().catch(() => false))) {
    return false;
  }

  const text = await locator.innerText().catch(() => "");
  const ariaLabel = await locator.getAttribute("aria-label").catch(() => "");
  if (!isSearchTriggerClickText(text) && !isSearchTriggerClickText(ariaLabel ?? "")) {
    return false;
  }

  if (await isDisabledControl(locator)) {
    return false;
  }

  await locator.click();
  return true;
}

async function submitSearchInput(page: Page, input: Locator, query: string): Promise<void> {
  await input.fill("");
  await input.pressSequentially(query, { delay: SEARCH_INPUT_TYPE_DELAY_MS });
  await page.waitForTimeout(SEARCH_SUBMIT_PAUSE_MS);
  await input.press("Enter");
  await waitForSearchSettled(page);
}

export function isSearchTriggerClickText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return false;
  }

  return SEARCH_TRIGGER_CLICK_LABELS.some((label) => label.test(normalized));
}

export function isLocationSetupRequiredText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return false;
  }

  return /\b(?:select|enter|set|choose|add|change)\b.*\b(?:delivery\s+)?(?:location|address)\b|\bwhere should we deliver\b|\bplease select your location\b|\bset delivery location\b/i.test(
    normalized
  );
}

async function waitForSearchSettled(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () => /ADD|Out of stock|No results|Search/i.test(document.body.innerText),
      undefined,
      { timeout: 15_000 }
    )
    .catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  await assertNoAccessChallenge(page);
}

async function searchPublicHomepageProducts(page: Page, query: string, limit: number): Promise<Product[]> {
  await gotoWithAccessProtection(page, BASE_URL);
  const products = await extractProducts(page, Math.max(limit * 4, 40));
  return filterProductsForQuery(products, query).slice(0, limit);
}

export function filterProductsForQuery(products: Product[], query: string): Product[] {
  return products
    .filter((product) => textMatchesProductQuery([product.name, product.unit].filter(Boolean).join(" "), query))
    .map((product, index) => ({
      ...product,
      index
    }));
}

async function assertTaggedProductControlMatches(
  locator: Locator,
  product: Product,
  error: { code: string; message: string; hint: string }
): Promise<void> {
  const cardText = await locator.evaluate(readClosestProductAddCardText).catch(() => "");
  const expectedText = [product.name, product.unit].filter(Boolean).join(" ");
  if (expectedText && textMatchesProductQuery(cardText, expectedText)) {
    return;
  }

  throw new UserFacingError(error.message, {
    code: error.code,
    hint: error.hint
  });
}

function readClosestProductAddCardText(element: Element): string {
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
  const visibleText = (target: Element) =>
    target instanceof HTMLElement ? normalize(target.innerText) : normalize(target.textContent ?? "");
  const imageAltText = (target: Element) =>
    Array.from(target.querySelectorAll("img[alt]"))
      .map((image) => image.getAttribute("alt") ?? "")
      .filter(Boolean)
      .join(" ");

  let current: Element | null = element;
  for (let depth = 0; current && depth < 8; depth += 1) {
    const text = visibleText(current);
    if (text.includes("₹") && text.length < 1500) {
      return normalize(`${text} ${imageAltText(current)}`);
    }

    current = current.parentElement;
  }

  return normalize(`${visibleText(element)} ${imageAltText(element)}`);
}

async function extractProducts(page: Page, limit: number): Promise<Product[]> {
  const rawCards = await page.evaluate((maxCards) => {
    const visibleText = (element: Element) =>
      element instanceof HTMLElement ? element.innerText : (element.textContent ?? "");
    const isVisible = (element: Element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const hasDisabledState = (element: Element) => {
      const dataDisabled = element.getAttribute("data-disabled");
      return (
        element.hasAttribute("disabled") ||
        element.getAttribute("aria-disabled")?.toLowerCase() === "true" ||
        (dataDisabled !== null && dataDisabled.toLowerCase() !== "false")
      );
    };
    const isEnabledControl = (element: Element) => {
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

      return true;
    };

    const cardFor = (element: Element) => {
      let current: Element | null = element;
      for (let depth = 0; current && depth < 8; depth += 1) {
        const text = visibleText(current);
        if (text.includes("₹") && text.length < 1500) {
          return current;
        }
        current = current.parentElement;
      }
      return element;
    };

    const hrefFor = (element: Element) => {
      const anchor = element.closest("a[href]");
      return anchor instanceof HTMLAnchorElement ? anchor.href : undefined;
    };

    const buttons = Array.from(document.querySelectorAll("button, [role='button']"))
      .filter((button) => /^add$/i.test((button.textContent ?? "").trim()) && isVisible(button) && isEnabledControl(button))
      .slice(0, maxCards);

    const cards = buttons.map((button, index) => {
      button.setAttribute("data-zepo-add-id", String(index));
      const card = cardFor(button);
      const image = card.querySelector("img[alt]");
      return {
        automationId: index,
        text: visibleText(card),
        imageAlt: image?.getAttribute("alt") ?? undefined,
        href: hrefFor(card)
      };
    });

    if (cards.length > 0) {
      return cards;
    }

    return Array.from(document.querySelectorAll("img[alt]"))
      .filter((image) => isVisible(image))
      .slice(0, maxCards)
      .map((image) => {
        const card = cardFor(image);
        return {
          text: visibleText(card),
          imageAlt: image.getAttribute("alt") ?? undefined,
          href: hrefFor(card)
        };
      });
  }, Math.max(limit * 3, 12)) as RawProductCard[];

  const parsed: Product[] = [];
  for (const raw of rawCards) {
    const product = parseProductCard(raw, parsed.length);
    if (product) {
      parsed.push(product);
    }
  }

  return dedupeProducts(parsed);
}
