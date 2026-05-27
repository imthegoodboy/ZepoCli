import { writeFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { chromium } from "playwright";

import type { AppRuntime } from "../config/runtime.js";
import type { DoctorCheck, DoctorReport } from "../types.js";

const MIN_NODE_VERSION = "20.11.0";

export interface DoctorOptions {
  browser: boolean;
}

export class DoctorService {
  constructor(private readonly runtime: AppRuntime) {}

  async run(options: DoctorOptions = { browser: true }): Promise<DoctorReport> {
    const checks: DoctorCheck[] = [
      checkNodeVersion(process.versions.node),
      await this.checkDataDirWritable(),
      this.checkSqlite(),
      this.checkSession()
    ];

    if (options.browser) {
      checks.push(await this.checkPlaywrightChromium());
    }

    return {
      ok: checks.every((check) => check.status !== "fail"),
      generatedAt: new Date().toISOString(),
      checks
    };
  }

  private async checkDataDirWritable(): Promise<DoctorCheck> {
    const probePath = join(this.runtime.paths.diagnosticsDir, `.doctor-${randomUUID()}.tmp`);

    try {
      await writeFile(probePath, "ok");
      await rm(probePath, { force: true });
      return {
        name: "Data directory",
        status: "pass",
        message: `Writable at ${this.runtime.paths.dataDir}`
      };
    } catch (error) {
      return {
        name: "Data directory",
        status: "fail",
        message: error instanceof Error ? error.message : String(error),
        hint: "Choose a writable path with `zepo --data-dir <path> doctor`."
      };
    }
  }

  private checkSqlite(): DoctorCheck {
    try {
      this.runtime.sqlite.healthCheck();
      return {
        name: "SQLite",
        status: "pass",
        message: "Local metadata database is usable."
      };
    } catch (error) {
      return {
        name: "SQLite",
        status: "fail",
        message: error instanceof Error ? error.message : String(error),
        hint: "Check file permissions in the ZepoCli data directory."
      };
    }
  }

  private checkSession(): DoctorCheck {
    const status = this.runtime.session.status();
    if (this.runtime.session.hasConfirmedSession()) {
      return {
        name: "Zepto session",
        status: "pass",
        message: "Saved auth state and persistent browser profile are present."
      };
    }

    if (status.hasAuthState || status.hasBrowserProfileData || status.markedLoggedIn) {
      return {
        name: "Zepto session",
        status: "warn",
        message: "Partial Zepto session data was found, but login is not confirmed.",
        hint: "Run `zepo login` again before account-dependent commands."
      };
    }

    return {
      name: "Zepto session",
      status: "warn",
      message: "No saved Zepto login session was found.",
      hint: "Run `zepo login` before account-dependent commands."
    };
  }

  private async checkPlaywrightChromium(): Promise<DoctorCheck> {
    try {
      const browser = await chromium.launch({ headless: true });
      await browser.close();
      return {
        name: "Playwright Chromium",
        status: "pass",
        message: "Chromium launches successfully."
      };
    } catch (error) {
      return {
        name: "Playwright Chromium",
        status: "fail",
        message: error instanceof Error ? error.message : String(error),
        hint: "Run `npm run prepare:browsers` or `npx playwright install chromium`."
      };
    }
  }
}

export function checkNodeVersion(version: string): DoctorCheck {
  if (compareVersions(version, MIN_NODE_VERSION) >= 0) {
    return {
      name: "Node.js",
      status: "pass",
      message: `v${version}`
    };
  }

  return {
    name: "Node.js",
    status: "fail",
    message: `v${version} is below the required v${MIN_NODE_VERSION}.`,
    hint: `Install Node.js ${MIN_NODE_VERSION} or newer.`
  };
}

export function compareVersions(left: string, right: string): number {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);

  for (let index = 0; index < 3; index += 1) {
    const difference = leftParts[index]! - rightParts[index]!;
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

function parseVersion(version: string): [number, number, number] {
  const parts = version.split(".").map((part) => Number.parseInt(part, 10));
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}
