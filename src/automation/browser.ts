import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { chromium, type BrowserContext, type Page } from "playwright";

import { BASE_URL } from "../config/constants.js";
import type { AppRuntime } from "../config/runtime.js";
import type { SessionStatus } from "../types.js";
import { UserFacingError } from "../utils/errors.js";

export interface BrowserRunOptions {
  headless?: boolean;
  requireSession?: boolean;
  saveState?: boolean;
}

export class BrowserAutomation {
  constructor(private readonly runtime: AppRuntime) {}

  async withPage<T>(
    options: BrowserRunOptions,
    task: (page: Page, context: BrowserContext) => Promise<T>
  ): Promise<T> {
    if (options.requireSession && !this.runtime.session.hasConfirmedSession()) {
      const status = this.runtime.session.status();
      throw new UserFacingError("No confirmed Zepto session found.", {
        hint: confirmedSessionHint(status)
      });
    }

    const context = await chromium.launchPersistentContext(this.runtime.session.browserProfileDir, {
      headless: options.headless ?? this.runtime.options.headless,
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      locale: "en-IN",
      timezoneId: "Asia/Kolkata",
      viewport: {
        width: 1366,
        height: 900
      }
    });

    context.setDefaultTimeout(this.runtime.options.timeoutMs);
    context.setDefaultNavigationTimeout(this.runtime.options.timeoutMs);

    const page = await context.newPage();

    try {
      const result = await task(page, context);
      if (options.saveState ?? true) {
        await context.storageState({ path: this.runtime.session.storageStatePath });
      }
      return result;
    } catch (error) {
      await this.captureFailure(page, error).catch(() => undefined);
      throw error;
    } finally {
      await context.close().catch(() => undefined);
    }
  }

  private async captureFailure(page: Page, error: unknown): Promise<void> {
    if (!this.runtime.options.debug) {
      return;
    }

    mkdirSync(this.runtime.paths.diagnosticsDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const screenshotPath = join(this.runtime.paths.diagnosticsDir, `${stamp}.png`);
    const htmlPath = join(this.runtime.paths.diagnosticsDir, `${stamp}.html`);
    const url = page.url();

    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
    writeFileSync(htmlPath, await page.content());

    this.runtime.logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        url,
        screenshotPath,
        htmlPath
      },
      "browser automation failed"
    );
  }
}

function confirmedSessionHint(status: SessionStatus): string {
  if (!status.hasAuthState) {
    return "Run `zepo login` first.";
  }

  if (!status.markedLoggedIn) {
    return "Run `zepo login` again and confirm only after Zepto shows your account.";
  }

  if (!status.hasBrowserProfileData) {
    return "The persistent browser profile is missing. Run `zepo login` again.";
  }

  return "Run `zepo status` to inspect local session state, then retry `zepo login` if needed.";
}

export async function gotoZepto(page: Page, path = "/"): Promise<void> {
  const url = new URL(path, BASE_URL).toString();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
}

export async function clickFirstText(page: Page, labels: RegExp[]): Promise<boolean> {
  for (const label of labels) {
    const locator = page.getByText(label).first();
    if (await locator.isVisible().catch(() => false)) {
      await locator.click();
      return true;
    }
  }

  return false;
}

