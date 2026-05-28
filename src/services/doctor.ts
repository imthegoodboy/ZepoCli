import { writeFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";

import { chromium } from "playwright";

import {
  getAccessChallengeCooldownStatus,
  getBrowserAutomationReadiness,
  getBrowserRunLockStatus,
  getHeadlessBrowserThrottleStatus,
  HEADLESS_BROWSER_RUN_HISTORY_META_KEY,
  LAST_ACCESS_CHALLENGE_META_KEY
} from "../automation/browser.js";
import type { AppRuntime } from "../config/runtime.js";
import type { DoctorCheck, DoctorReport } from "../types.js";

const MIN_NODE_VERSION = "20.11.0";

export interface DoctorOptions {
  browser: boolean;
}

export class DoctorService {
  constructor(private readonly runtime: AppRuntime) {}

  async run(options: DoctorOptions = { browser: true }): Promise<DoctorReport> {
    const browserLock = getBrowserRunLockStatus(this.runtime.paths.browserLockPath);
    const headlessBrowserThrottle = getHeadlessBrowserThrottleStatus(
      this.runtime.sqlite.getMeta(HEADLESS_BROWSER_RUN_HISTORY_META_KEY)
    );
    const accessChallenge = getAccessChallengeCooldownStatus(
      this.runtime.sqlite.getMeta(LAST_ACCESS_CHALLENGE_META_KEY)
    );
    const browserAutomation = getBrowserAutomationReadiness({
      browserLock,
      headlessBrowserThrottle,
      accessChallenge
    });
    const checks: DoctorCheck[] = [
      checkNodeVersion(process.versions.node),
      await this.checkDataDirWritable(),
      this.checkSqlite(),
      this.checkSession(),
      this.checkBrowserAutomationLock(browserLock),
      this.checkHeadlessBrowserThrottle(headlessBrowserThrottle),
      this.checkAccessChallengeCooldown(accessChallenge)
    ];

    if (options.browser) {
      checks.push(await this.checkPlaywrightChromium());
    }

    return {
      ok: checks.every((check) => check.status !== "fail"),
      generatedAt: new Date().toISOString(),
      dataDir: this.runtime.paths.dataDir,
      browserLock,
      browserAutomation,
      headlessBrowserThrottle,
      accessChallenge,
      checks
    };
  }

  private async checkDataDirWritable(): Promise<DoctorCheck> {
    const targets = [
      {
        label: "data directory",
        path: this.runtime.paths.dataDir
      },
      {
        label: "storage directory",
        path: dirname(this.runtime.paths.authStatePath)
      },
      {
        label: "browser profile directory",
        path: this.runtime.paths.browserProfileDir
      },
      {
        label: "diagnostics directory",
        path: this.runtime.paths.diagnosticsDir
      }
    ];

    try {
      for (const target of targets) {
        await assertWritableDirectory(target.path);
      }

      return {
        name: "Data directory",
        status: "pass",
        message: `Writable runtime directories under ${this.runtime.paths.dataDir}`
      };
    } catch (error) {
      const failure = error instanceof WritableDirectoryError ? error : undefined;
      return {
        name: "Data directory",
        status: "fail",
        message: failure
          ? `${failure.path} is not writable: ${failure.causeMessage}`
          : error instanceof Error
            ? error.message
            : String(error),
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

    if (status.hasAuthState || status.markedLoggedIn) {
      return {
        name: "Zepto session",
        status: "warn",
        message: "Partial Zepto session data was found, but login is not confirmed.",
        hint: "Run `zepo login` again before account-dependent commands."
      };
    }

    if (status.hasBrowserProfileData) {
      return {
        name: "Zepto session",
        status: "warn",
        message: "Browser profile data exists, but no saved Zepto login session was found.",
        hint: "Run `zepo login` before account-dependent commands."
      };
    }

    return {
      name: "Zepto session",
      status: "warn",
      message: "No saved Zepto login session was found.",
      hint: "Run `zepo login` before account-dependent commands."
    };
  }

  private checkBrowserAutomationLock(lock: ReturnType<typeof getBrowserRunLockStatus>): DoctorCheck {
    if (!lock.present) {
      return {
        name: "Browser automation lock",
        status: "pass",
        message: "No browser command is holding the current data directory lock."
      };
    }

    if (lock.stale) {
      return {
        name: "Browser automation lock",
        status: "warn",
        message: "A stale browser automation lock exists for this data directory.",
        hint: `If no ZepoCli browser command is running, remove ${lock.path} and retry.`
      };
    }

    return {
      name: "Browser automation lock",
      status: "warn",
      message: "Another ZepoCli browser command appears to be using this data directory.",
      hint: "Wait for it to finish, or use a separate `--data-dir` for an independent session."
    };
  }

  private checkAccessChallengeCooldown(status: ReturnType<typeof getAccessChallengeCooldownStatus>): DoctorCheck {
    if (status.cooldownActive) {
      return {
        name: "Zepto access challenge",
        status: "warn",
        message: "Recent Zepto verification or blocking was detected; headless automation is cooling down.",
        hint: `Wait ${formatDuration(status.retryAfterMs)} or rerun with \`--visible\` to resolve Zepto-controlled verification manually.`
      };
    }

    if (status.detected) {
      return {
        name: "Zepto access challenge",
        status: "pass",
        message: "A previous Zepto access challenge was recorded, but the cooldown has expired."
      };
    }

    return {
      name: "Zepto access challenge",
      status: "pass",
      message: "No recent Zepto access challenge was recorded."
    };
  }

  private checkHeadlessBrowserThrottle(status: ReturnType<typeof getHeadlessBrowserThrottleStatus>): DoctorCheck {
    if (status.throttleActive) {
      return {
        name: "Headless browser throttle",
        status: "warn",
        message: "Many recent headless Zepto browser commands were detected; headless automation is cooling down.",
        hint: `Wait ${formatDuration(status.retryAfterMs)} before retrying headless commands, or rerun with \`--visible\` for a human-controlled browser flow.`
      };
    }

    return {
      name: "Headless browser throttle",
      status: "pass",
      message:
        status.recentRuns > 0
          ? `${status.recentRuns}/${status.limit} headless browser runs in the current window.`
          : "No recent headless browser run burst was recorded."
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

class WritableDirectoryError extends Error {
  constructor(
    readonly path: string,
    readonly causeMessage: string
  ) {
    super(`${path} is not writable: ${causeMessage}`);
    this.name = "WritableDirectoryError";
  }
}

async function assertWritableDirectory(path: string): Promise<void> {
  const probePath = join(path, `.doctor-${randomUUID()}.tmp`);

  try {
    await writeFile(probePath, "ok");
    await rm(probePath, { force: true });
  } catch (error) {
    await rm(probePath, { force: true }).catch(() => undefined);
    throw new WritableDirectoryError(path, error instanceof Error ? error.message : String(error));
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

function formatDuration(ms: number): string {
  const seconds = Math.ceil(ms / 1_000);
  if (seconds < 60) {
    return `${seconds} second${seconds === 1 ? "" : "s"}`;
  }

  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}
