import type { Locator, Page } from "playwright";

import { assertNoAccessChallenge, gotoZepto } from "./browser.js";
import { isDisabledControl, readControlLabels } from "./control-state.js";
import { findPhonePrefillInput, hasVisibleLoginFormInput } from "./login-inputs.js";

export type LoginState = "logged-in" | "login-required" | "unknown";
export {
  findPhonePrefillInput,
  hasVisibleLoginFormInput,
  isPhonePrefillInputText,
  isSafePhonePrefillInput,
  isUnsafePhonePrefillInputText,
  PHONE_PREFILL_INPUT_SELECTOR
} from "./login-inputs.js";
export const ACCOUNT_SURFACE_CLICK_LABELS = [
  /^account$/i,
  /^profile$/i,
  /^login$/i,
  /^log in$/i,
  /^sign in$/i,
  /^login\s*\/\s*sign\s*up$/i,
  /^log in\s*\/\s*sign up$/i
] as const;
const PHONE_PREFILL_TYPE_DELAY_MS = 45;
const LOGIN_REQUIRED_TEXT_PATTERN =
  /\b(enter mobile|mobile number|phone number|otp|verify otp|verify mobile|sign in|login to continue|log in to continue|login to view|log in to view|login\s*\/\s*sign\s*up|login\/sign up|continue with phone|continue with mobile)\b/i;

export async function openLoginFlow(page: Page, phone?: string): Promise<void> {
  await openAccountSurface(page);

  if (phone) {
    const phoneInput = await findPhonePrefillInput(page);
    if (phoneInput) {
      await phoneInput.fill("");
      await phoneInput.pressSequentially(phone, { delay: PHONE_PREFILL_TYPE_DELAY_MS });
    }
  }
}

export async function openAccountSurface(page: Page): Promise<void> {
  await gotoZepto(page);

  if (await clickAccountSurfaceButton(page)) {
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
    await page.waitForTimeout(500);
    await assertNoAccessChallenge(page);
  }
}

export async function clickAccountSurfaceButton(page: Page): Promise<boolean> {
  const controls = page.locator("button, [role='button'], a");
  for (const label of ACCOUNT_SURFACE_CLICK_LABELS) {
    const candidates = [
      page.getByRole("button", { name: label }).first(),
      page.getByRole("link", { name: label }).first(),
      controls.filter({ hasText: label }).first()
    ];

    for (const candidate of candidates) {
      if (await clickSafeAccountSurfaceControl(candidate)) {
        return true;
      }
    }
  }

  return false;
}

async function clickSafeAccountSurfaceControl(locator: Locator): Promise<boolean> {
  if (!(await locator.isVisible().catch(() => false))) {
    return false;
  }

  const labels = await readControlLabels(locator);
  if (labels.some(isUnsafeAccountSurfaceClickText)) {
    return false;
  }

  if (!labels.some(isAccountSurfaceClickText)) {
    return false;
  }

  if (await isDisabledControl(locator)) {
    return false;
  }

  await locator.click();
  return true;
}

export async function detectLoginState(page: Page): Promise<LoginState> {
  const bodyText = await page.locator("body").innerText().catch(() => "");
  const textState = inferLoginStateFromText(bodyText);
  if (textState !== "unknown") {
    return textState;
  }

  if (await hasVisibleLoginFormInput(page)) {
    return "login-required";
  }

  return "unknown";
}

export function isAccountSurfaceClickText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return false;
  }

  return ACCOUNT_SURFACE_CLICK_LABELS.some((label) => label.test(normalized));
}

export function isUnsafeAccountSurfaceClickText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return false;
  }

  return /\b(search results?|cart|my cart|checkout|proceed|continue|next|submit|verify|otp|mobile number|phone number|payment|pay|view bill|bill summary|to pay|orders?|order history|track order|reorder|address|location|deliver(?:ing)? to)\b/i.test(
    normalized
  );
}

export function inferLoginStateFromText(text: string): LoginState {
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();

  if (!normalized) {
    return "unknown";
  }

  if (LOGIN_REQUIRED_TEXT_PATTERN.test(normalized)) {
    return "login-required";
  }

  if (hasLoggedInAccountEvidence(normalized) && !/\blogin\b/i.test(normalized)) {
    return "logged-in";
  }

  if (/\blogin\b/i.test(normalized)) {
    return "login-required";
  }

  return "unknown";
}

function hasLoggedInAccountEvidence(text: string): boolean {
  if (/\b(logout|log out)\b/i.test(text)) {
    return true;
  }

  const hasAccountEntry = /\b(account|profile)\b/i.test(text);
  const hasAccountOnlyFeature = /\b(wallet|my orders|orders|order history)\b/i.test(text);
  return hasAccountEntry && hasAccountOnlyFeature;
}
