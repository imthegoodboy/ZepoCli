import type { Page } from "playwright";

import { gotoZepto } from "./browser.js";

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
