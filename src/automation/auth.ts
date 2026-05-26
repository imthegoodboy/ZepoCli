import type { Page } from "playwright";

import { gotoZepto } from "./browser.js";

export type LoginState = "logged-in" | "login-required" | "unknown";

export async function openLoginFlow(page: Page, phone?: string): Promise<void> {
  await gotoZepto(page);

  const loginButton = page.getByText(/login|sign in|profile/i).first();
  if (await loginButton.isVisible().catch(() => false)) {
    await loginButton.click();
  }

  if (phone) {
    const phoneInput = page.locator("input[type='tel'], input[inputmode='numeric'], input[name*='phone' i]").first();
    if (await phoneInput.isVisible().catch(() => false)) {
      await phoneInput.fill(phone);
    }
  }
}

export async function detectLoginState(page: Page): Promise<LoginState> {
  const phoneInput = page.locator("input[type='tel'], input[inputmode='numeric'], input[name*='phone' i]").first();
  if (await phoneInput.isVisible().catch(() => false)) {
    return "login-required";
  }

  const bodyText = await page.locator("body").innerText().catch(() => "");
  return inferLoginStateFromText(bodyText);
}

export function inferLoginStateFromText(text: string): LoginState {
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();

  if (!normalized) {
    return "unknown";
  }

  if (/\b(enter mobile|mobile number|phone number|otp|verify otp|sign in|login to continue)\b/i.test(normalized)) {
    return "login-required";
  }

  if (/\b(my orders|logout|log out|account|profile|wallet)\b/i.test(normalized) && !/\blogin\b/i.test(normalized)) {
    return "logged-in";
  }

  if (/\blogin\b/i.test(normalized)) {
    return "login-required";
  }

  return "unknown";
}
