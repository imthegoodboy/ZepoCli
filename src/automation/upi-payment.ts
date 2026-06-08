import type { Locator, Page } from "playwright";

import type { CartSnapshot } from "../types.js";
import { UserFacingError } from "../utils/errors.js";
import { decodeUpiPayloadFromPngBase64, isUpiPaymentPayload } from "../utils/upi-qr.js";
import {
  assertReadableCheckoutCart,
  clickCheckoutHandoffButton,
  detectCheckoutHandoffMode,
  type CheckoutHandoffResult,
  isCheckoutHandoffText,
  readCheckoutCartPrecondition
} from "./checkout.js";
import { assertNoAccessChallenge } from "./browser.js";
import { isDisabledControl, readControlLabels } from "./control-state.js";
import { isFinalPaymentOrOrderActionText } from "./final-action-labels.js";
import { isPaymentHandoffSurfaceText, isPaymentSelectionPromptText } from "./payment-labels.js";

export const PAYMENT_NAVIGATION_CLICK_LABELS = [
  /^continue\s+to\s+payment(?:\s+(?:₹|rs\.?\s*)?[\d,]+(?:\.\d+)?)?$/i,
  /^proceed\s+to\s+payment(?:\s+(?:₹|rs\.?\s*)?[\d,]+(?:\.\d+)?)?$/i,
  /^(?:click|tap)\s+to\s+pay\s+(?:₹|rs\.?\s*|inr\s*)[\d,]+(?:\.\d+)?$/i
] as const;

export const UPI_METHOD_SELECT_LABELS = [
  /^pay\s+(?:via|by)\s+qr\s+code(?:\s+new)?$/i,
  /^qr\s+code$/i,
  /^scan\s+(?:&|and)\s+pay$/i,
  /^pay\s+by\s+upi$/i,
  /^pay\s+via\s+upi$/i,
  /^upi$/i
] as const;

const UPI_METHOD_TEXT_LOCATOR_LABELS = [
  /pay\s+(?:via|by)\s+qr\s+code/i,
  /qr\s+code/i,
  /scan\s+(?:&|and)\s+pay/i,
  /pay\s+by\s+upi/i,
  /pay\s+via\s+upi/i,
  /^upi$/i
] as const;

const PAYMENT_SURFACE_MAX_STEPS = 8;
const PAYMENT_SURFACE_SETTLE_MS = 1_500;
const UPI_QR_WAIT_TIMEOUT_MS = 20_000;
const UPI_QR_POLL_MS = 750;
const PAYMENT_CONTROL_SCAN_LIMIT = 48;
const PAYMENT_CLICK_TIMEOUT_MS = 10_000;
const UPI_QR_CANDIDATE_SCAN_LIMIT = 24;
const UPI_QR_MIN_RENDERED_SIZE_PX = 48;
const UPI_QR_SCREENSHOT_TIMEOUT_MS = 5_000;
const UPI_QR_CANDIDATE_SELECTOR = [
  "img",
  "canvas",
  "svg",
  '[aria-label*="qr" i]',
  '[aria-label*="upi" i]',
  '[class*="qr" i]',
  '[class*="upi" i]',
  '[id*="qr" i]',
  '[id*="upi" i]',
  '[data-testid*="qr" i]',
  '[data-testid*="upi" i]'
].join(", ");

export interface UpiPaymentQrCapture {
  pngBase64: string;
  payload: string;
  amount?: string;
  itemCount?: number;
  cart?: CartSnapshot;
}

export interface UpiPaymentOptions {
  removeLimitItems?: boolean;
}

export async function captureUpiPaymentQr(page: Page, options: UpiPaymentOptions = {}): Promise<UpiPaymentQrCapture> {
  const cart = await readCheckoutCartPrecondition(page, options);
  const cartText = cart.rawText ?? "";
  assertReadableCheckoutCart(cartText, cart.items);

  const initialHandoff = await detectCheckoutHandoffMode(page);
  if (shouldClickCheckoutHandoffBeforeUpi(initialHandoff, cartText)) {
    const clicked = await clickCheckoutHandoffButton(page);
    if (!clicked) {
      throw new UserFacingError("Could not open Zepto checkout before requesting a UPI payment QR.", {
        code: "checkout_unavailable",
        hint: "Check address, minimum cart value, and unavailable items, then rerun `zepo payment`."
      });
    }
  }

  await navigateToUpiQrSurface(page);
  const qr = await waitForUpiQrCapture(page);
  return {
    ...qr,
    itemCount: cart.items.length,
    cart,
    ...(cart.total ? { amount: cart.total } : {})
  };
}

export function shouldClickCheckoutHandoffBeforeUpi(
  initialHandoff: CheckoutHandoffResult | undefined,
  cartText: string
): boolean {
  return initialHandoff === undefined && !isCheckoutHandoffText(cartText);
}

export async function navigateToUpiQrSurface(page: Page): Promise<void> {
  for (let step = 0; step < PAYMENT_SURFACE_MAX_STEPS; step += 1) {
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
    await assertNoAccessChallenge(page);

    if (await hasVisibleUpiQr(page)) {
      return;
    }

    const bodyText = await readBodyText(page);
    if (isUpiQrPaymentSurfaceText(bodyText)) {
      return;
    }

    if (isPaymentSelectionPromptText(bodyText) || isPaymentHandoffSurfaceText(bodyText)) {
      if (await clickUpiMethodButton(page)) {
        await page.waitForTimeout(PAYMENT_SURFACE_SETTLE_MS);
        continue;
      }
    }

    if (await clickPaymentNavigationButton(page)) {
      await page.waitForTimeout(PAYMENT_SURFACE_SETTLE_MS);
      continue;
    }

    if (await hasVisibleUpiQr(page)) {
      return;
    }

    break;
  }

  if (!(await hasVisibleUpiQr(page))) {
    throw new UserFacingError("Zepto did not show a UPI payment QR.", {
      code: "upi_qr_unavailable",
      hint: "Confirm address and cart readiness with `zepo cart`, then rerun `zepo payment`."
    });
  }
}

export function isUpiQrPaymentSurfaceText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return false;
  }

  return (
    /\bqr\s+code\b/i.test(normalized) &&
    /\b(share this qr code|trusted individuals|scan(?:\s+(?:and|&))?\s+pay|scan\b[^.]{0,80}\bupi|expires?|valid for)\b/i.test(
      normalized
    )
  );
}

export async function waitForUpiQrCapture(page: Page): Promise<Omit<UpiPaymentQrCapture, "amount">> {
  const deadline = Date.now() + UPI_QR_WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const capture = await readUpiQrFromPage(page);
    if (capture) {
      return capture;
    }

    await page.waitForTimeout(UPI_QR_POLL_MS);
  }

  throw new UserFacingError("Timed out waiting for Zepto's UPI payment QR.", {
    code: "upi_qr_timeout",
    hint: "Retry `zepo payment` after confirming the cart and delivery address."
  });
}

export async function hasVisibleUpiQr(page: Page): Promise<boolean> {
  return (await readUpiQrFromPage(page)) !== undefined;
}

export async function readUpiQrFromPage(page: Page): Promise<Omit<UpiPaymentQrCapture, "amount"> | undefined> {
  const embeddedCapture = await readEmbeddedUpiQrFromPage(page);
  if (embeddedCapture) {
    return embeddedCapture;
  }

  return readRenderedUpiQrFromPage(page);
}

async function readEmbeddedUpiQrFromPage(page: Page): Promise<Omit<UpiPaymentQrCapture, "amount"> | undefined> {
  const imageData = await page
    .evaluate(() => {
      const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
      const isVisible = (element: Element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width >= 48 && rect.height >= 48 && style.display !== "none" && style.visibility !== "hidden";
      };
      const parseDataImage = (src: string | null | undefined) => {
        const normalized = normalize(src);
        const match = normalized.match(/^data:image\/(?:png|jpeg|jpg|webp);base64,(.+)$/i);
        return match?.[1]?.trim();
      };

      const imageSelectors = [
        'img[src^="data:image"][alt*="qr" i]',
        'img[src^="data:image"][class*="upi" i]',
        'img[src^="data:image/png;base64"]',
        'img[src^="data:image/jpeg;base64"]'
      ];

      const captures: Array<{ pngBase64: string }> = [];
      for (const selector of imageSelectors) {
        for (const element of Array.from(document.querySelectorAll(selector))) {
          if (!isVisible(element)) {
            continue;
          }

          const base64 = parseDataImage(element.getAttribute("src"));
          if (base64 && base64.length > 100) {
            captures.push({ pngBase64: base64 });
          }
        }
      }

      for (const canvas of Array.from(document.querySelectorAll("canvas"))) {
        if (!isVisible(canvas)) {
          continue;
        }

        try {
          const dataUrl = canvas.toDataURL("image/png");
          const base64 = parseDataImage(dataUrl);
          if (base64 && base64.length > 100) {
            captures.push({ pngBase64: base64 });
          }
        } catch {
          continue;
        }
      }

      return captures.slice(0, 12);
    })
    .catch(() => undefined);

  const captures = Array.isArray(imageData) ? imageData : imageData ? [imageData] : [];
  for (const capture of captures) {
    if (!capture?.pngBase64) {
      continue;
    }

    const payload = decodeUpiPayloadFromPngBase64(capture.pngBase64);
    if (payload && isUpiPaymentPayload(payload)) {
      return {
        pngBase64: capture.pngBase64,
        payload
      };
    }
  }

  return undefined;
}

async function readRenderedUpiQrFromPage(page: Page): Promise<Omit<UpiPaymentQrCapture, "amount"> | undefined> {
  const candidates = page.locator(UPI_QR_CANDIDATE_SELECTOR);
  for await (const candidate of iterateLocatorCandidates(candidates, UPI_QR_CANDIDATE_SCAN_LIMIT)) {
    if (!(await candidate.isVisible().catch(() => false))) {
      continue;
    }

    const box = await readLocatorBoundingBox(candidate);
    if (box && (box.width < UPI_QR_MIN_RENDERED_SIZE_PX || box.height < UPI_QR_MIN_RENDERED_SIZE_PX)) {
      continue;
    }

    const screenshot = await candidate
      .screenshot({ type: "png", timeout: UPI_QR_SCREENSHOT_TIMEOUT_MS })
      .catch(() => undefined);
    if (!screenshot || screenshot.length <= 100) {
      continue;
    }

    const pngBase64 = Buffer.from(screenshot).toString("base64");
    const payload = decodeUpiPayloadFromPngBase64(pngBase64);
    if (payload && isUpiPaymentPayload(payload)) {
      return {
        pngBase64,
        payload
      };
    }
  }

  return undefined;
}

export function isPaymentNavigationClickText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return false;
  }

  return isAllowedPaymentNavigationClickText(normalized) && !isUnsafePaymentNavigationClickText(normalized);
}

export function isUpiMethodSelectClickText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return false;
  }

  return isAllowedUpiMethodSelectClickText(normalized) && !isUnsafePaymentNavigationClickText(normalized);
}

export function isUnsafePaymentNavigationClickText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return false;
  }

  if (isAllowedPaymentNavigationClickText(normalized) || isAllowedUpiMethodSelectClickText(normalized)) {
    return false;
  }

  return (
    isFinalPaymentOrOrderActionText(normalized) ||
    /^(?:click|tap)\s+to\s+pay\b/i.test(normalized) ||
    /^pay(?:\s+now)?\b/i.test(normalized) ||
    /^place\s+order\b/i.test(normalized) ||
    /^confirm\s+order\b/i.test(normalized) ||
    /^pay\s+with\b/i.test(normalized) ||
    /\bpay\s*(?:₹|rs\.?\s*\d|inr\s*\d|\d)/i.test(normalized)
  );
}

function isAllowedPaymentNavigationClickText(text: string): boolean {
  return PAYMENT_NAVIGATION_CLICK_LABELS.some((label) => label.test(text));
}

function isAllowedUpiMethodSelectClickText(text: string): boolean {
  return UPI_METHOD_SELECT_LABELS.some((label) => label.test(text));
}

async function clickPaymentNavigationButton(page: Page): Promise<boolean> {
  const controls = page.locator("button, [role='button'], a, [tabindex], div, span");
  for (const label of PAYMENT_NAVIGATION_CLICK_LABELS) {
    const candidates = [
      page.getByRole("button", { name: label }),
      page.getByRole("link", { name: label }),
      ...getTextLocators(page, label),
      controls.filter({ hasText: label })
    ];

    for (const candidate of candidates) {
      if (await clickFirstSafePaymentControl(candidate, isPaymentNavigationClickText)) {
        return true;
      }
    }
  }

  return false;
}

async function clickUpiMethodButton(page: Page): Promise<boolean> {
  const controls = page.locator("button, [role='button'], a, [role='option'], li, div");
  for (const [index, label] of UPI_METHOD_SELECT_LABELS.entries()) {
    const candidates = [
      page.getByRole("button", { name: label }),
      page.getByRole("link", { name: label }),
      ...getTextLocators(page, label, UPI_METHOD_TEXT_LOCATOR_LABELS[index] ?? label),
      controls.filter({ hasText: label })
    ];

    for (const candidate of candidates) {
      if (await clickFirstSafePaymentControl(candidate, isUpiMethodSelectClickText)) {
        return true;
      }
    }
  }

  return false;
}

function getTextLocators(page: Page, ...texts: RegExp[]): Locator[] {
  const textPage = page as Page & {
    getByText?: (text: RegExp) => Locator;
  };
  if (typeof textPage.getByText !== "function") {
    return [];
  }

  return texts.map((text) => textPage.getByText?.(text)).filter((locator): locator is Locator => locator !== undefined);
}

async function clickFirstSafePaymentControl(
  locator: Locator,
  matcher: (text: string) => boolean
): Promise<boolean> {
  for await (const candidate of iterateLocatorCandidates(locator, PAYMENT_CONTROL_SCAN_LIMIT)) {
    if (await clickSafePaymentControl(candidate, matcher)) {
      return true;
    }
  }

  return false;
}

async function clickSafePaymentControl(locator: Locator, matcher: (text: string) => boolean): Promise<boolean> {
  if (!(await locator.isVisible().catch(() => false))) {
    return false;
  }

  const labels = await readControlLabels(locator);
  if (labels.some(isUnsafePaymentNavigationClickText)) {
    return false;
  }

  if (!labels.some(matcher)) {
    return false;
  }

  if (await isDisabledControl(locator)) {
    return false;
  }

  await scrollControlIntoViewIfNeeded(locator);
  if (!(await locator.isVisible().catch(() => false))) {
    return false;
  }

  const refreshedLabels = await readControlLabels(locator);
  if (refreshedLabels.some(isUnsafePaymentNavigationClickText) || !refreshedLabels.some(matcher)) {
    return false;
  }

  if (await isDisabledControl(locator)) {
    return false;
  }

  await locator.click({ timeout: PAYMENT_CLICK_TIMEOUT_MS });
  return true;
}

async function scrollControlIntoViewIfNeeded(locator: Locator): Promise<void> {
  const scrollable = locator as {
    scrollIntoViewIfNeeded?: () => Promise<void>;
  };
  await scrollable.scrollIntoViewIfNeeded?.().catch(() => undefined);
}

async function readBodyText(page: Page): Promise<string> {
  return page.locator("body").innerText().catch(() => "");
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

async function readLocatorBoundingBox(locator: Locator): Promise<{ width: number; height: number } | undefined> {
  const boxed = locator as {
    boundingBox?: () => Promise<{ width: number; height: number } | null>;
  };
  if (typeof boxed.boundingBox !== "function") {
    return undefined;
  }

  const box = await boxed.boundingBox().catch(() => null);
  return box ?? undefined;
}
