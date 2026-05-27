import type { Page } from "playwright";

import { BASE_URL } from "../config/constants.js";
import type { Product } from "../types.js";
import { UserFacingError } from "../utils/errors.js";
import { dedupeProducts, parseProductCard, type RawProductCard } from "./extract.js";

export async function searchProducts(page: Page, query: string, limit: number): Promise<Product[]> {
  const searchedFromHome = await searchFromHome(page, query);
  if (!searchedFromHome) {
    await openSearch(page, query);
  }

  let products = await extractProducts(page, limit);
  if (products.length === 0) {
    await openSearch(page, query);
    await waitForSearchSettled(page);
    products = await extractProducts(page, limit);
  }

  if (products.length === 0) {
    const bodyText = await page.locator("body").innerText().catch(() => "");
    if (!bodyText.trim()) {
      throw new UserFacingError("Zepto returned an empty page during search.", {
        hint: "This usually means the site blocked or rate-limited the browser session. Try `zepo login`, then rerun search with `--visible`."
      });
    }

    if (/no results|not found/i.test(bodyText)) {
      return [];
    }

    throw new UserFacingError("Zepto search did not expose readable product results.", {
      hint: "Set a delivery location with `zepo address add` or rerun search with `--visible`."
    });
  }

  return products.slice(0, limit);
}

export async function clickProductAdd(page: Page, product: Product): Promise<void> {
  if (product.automationId === undefined) {
    throw new UserFacingError("The selected product cannot be mapped back to an ADD button.");
  }

  const button = page.locator(`[data-zepo-add-id="${product.automationId}"]`).first();
  if (!(await button.isVisible().catch(() => false))) {
    throw new UserFacingError(`Could not find the ADD button for ${product.name}.`, {
      hint: "Run the search again. Zepto may have re-rendered the product list."
    });
  }

  await button.scrollIntoViewIfNeeded();
  await button.click();
}

export async function increaseProductQuantity(page: Page, product: Product, quantity: number): Promise<void> {
  if (quantity <= 1) {
    return;
  }

  if (product.automationId === undefined) {
    throw new UserFacingError(`Could not increase ${product.name} to quantity ${quantity}.`, {
      hint: "The selected product cannot be mapped back to Zepto quantity controls."
    });
  }

  const button = page.locator(`[data-zepo-add-id="${product.automationId}"]`).first();
  const card = button.locator("xpath=ancestor::*[contains(., '₹')][1]");

  for (let count = 1; count < quantity; count += 1) {
    const plus = card
      .locator("button, [role='button']")
      .filter({ hasText: /^\+$/ })
      .last();

    if (!(await plus.isVisible().catch(() => false))) {
      throw new UserFacingError(`Could not increase ${product.name} to quantity ${quantity}.`, {
        hint: "Zepto did not expose a plus control after adding the item. Open the cart with `zepo cart` and retry with a lower quantity."
      });
    }

    await plus.click();
  }
}

async function openSearch(page: Page, query: string): Promise<void> {
  const searchUrl = new URL("/search", BASE_URL);
  searchUrl.searchParams.set("query", query);
  await page.goto(searchUrl.toString(), { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
}

async function searchFromHome(page: Page, query: string): Promise<boolean> {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);

  const directInput = page
    .locator("input[type='search'], input[placeholder*='Search' i], input[aria-label*='Search' i]")
    .first();

  if (await directInput.isVisible().catch(() => false)) {
    await directInput.fill(query);
    await directInput.press("Enter");
    await waitForSearchSettled(page);
    return true;
  }

  const searchTrigger = page.getByText(/search/i).first();
  if (await searchTrigger.isVisible().catch(() => false)) {
    await searchTrigger.click();
    const inputAfterClick = page
      .locator("input[type='search'], input[placeholder*='Search' i], input[aria-label*='Search' i]")
      .first();
    await inputAfterClick.fill(query);
    await inputAfterClick.press("Enter");
    await waitForSearchSettled(page);
    return true;
  }

  return false;
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
}

async function extractProducts(page: Page, limit: number): Promise<Product[]> {
  const rawCards = await page.evaluate((maxCards) => {
    const isVisible = (element: Element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
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

    const hrefFor = (element: Element) => {
      const anchor = element.closest("a[href]");
      return anchor instanceof HTMLAnchorElement ? anchor.href : undefined;
    };

    const buttons = Array.from(document.querySelectorAll("button, [role='button']"))
      .filter((button) => /^add$/i.test((button.textContent ?? "").trim()) && isVisible(button))
      .slice(0, maxCards);

    const cards = buttons.map((button, index) => {
      button.setAttribute("data-zepo-add-id", String(index));
      const card = cardFor(button);
      const image = card.querySelector("img[alt]");
      return {
        automationId: index,
        text: card.textContent ?? "",
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
          text: card.textContent ?? "",
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
