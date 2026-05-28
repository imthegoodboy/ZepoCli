import { cpSync, existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import {
  getAccessChallengeCooldownStatus,
  getBrowserAutomationReadiness,
  getBrowserRunLockStatus,
  getHeadlessBrowserThrottleStatus,
  HEADLESS_BROWSER_RUN_HISTORY_META_KEY,
  LAST_ACCESS_CHALLENGE_META_KEY
} from "../automation/browser.js";
import { BASE_URL } from "../config/constants.js";
import type { AppPaths } from "../config/paths.js";
import type { SessionStatus } from "../types.js";
import type { SqliteStore } from "./sqlite.js";

const ZEPTO_SESSION_HOSTS = [new URL(BASE_URL).hostname.replace(/^www\./, ""), "zeptonow.com"];

export class SessionStore {
  constructor(
    private readonly paths: AppPaths,
    private readonly sqlite: SqliteStore
  ) {}

  get storageStatePath(): string {
    return this.paths.authStatePath;
  }

  get browserProfileDir(): string {
    return this.paths.browserProfileDir;
  }

  hasStorageState(): boolean {
    if (!existsSync(this.paths.authStatePath)) {
      return false;
    }

    if (statSync(this.paths.authStatePath).size <= 2) {
      return false;
    }

    try {
      return isStorageState(JSON.parse(readFileSync(this.paths.authStatePath, "utf8")));
    } catch {
      return false;
    }
  }

  markLoggedIn(): void {
    this.sqlite.markSession(true, this.paths.authStatePath);
  }

  markLoggedOut(): void {
    this.sqlite.markSession(false, this.paths.authStatePath);
  }

  createSnapshot(): SessionSnapshot {
    const snapshotDir = mkdtempSync(join(this.paths.dataDir, ".session-snapshot-"));
    const authStatePath = join(snapshotDir, "auth-state.json");
    const browserProfileDir = join(snapshotDir, "browser-profile");

    if (existsSync(this.paths.authStatePath)) {
      mkdirSync(dirname(authStatePath), { recursive: true });
      cpSync(this.paths.authStatePath, authStatePath);
    }

    if (existsSync(this.paths.browserProfileDir)) {
      cpSync(this.paths.browserProfileDir, browserProfileDir, { recursive: true });
    }

    return {
      snapshotDir,
      authStatePath,
      browserProfileDir,
      hadAuthState: existsSync(authStatePath),
      hadBrowserProfile: existsSync(browserProfileDir)
    };
  }

  restoreSnapshot(snapshot: SessionSnapshot): void {
    if (!isWithin(this.paths.dataDir, snapshot.snapshotDir)) {
      throw new Error("Refusing to restore session snapshot outside the data directory.");
    }

    rmSync(this.paths.authStatePath, { force: true });
    if (snapshot.hadAuthState) {
      mkdirSync(dirname(this.paths.authStatePath), { recursive: true });
      cpSync(snapshot.authStatePath, this.paths.authStatePath);
    }

    if (existsSync(this.paths.browserProfileDir) && isWithin(this.paths.dataDir, this.paths.browserProfileDir)) {
      rmSync(this.paths.browserProfileDir, { recursive: true, force: true });
    }
    if (snapshot.hadBrowserProfile) {
      cpSync(snapshot.browserProfileDir, this.paths.browserProfileDir, { recursive: true });
    } else {
      mkdirSync(this.paths.browserProfileDir, { recursive: true });
    }
  }

  disposeSnapshot(snapshot: SessionSnapshot): void {
    if (isWithin(this.paths.dataDir, snapshot.snapshotDir)) {
      rmSync(snapshot.snapshotDir, { recursive: true, force: true });
    }
  }

  status(): SessionStatus {
    const session = this.sqlite.getSession();
    const hasAuthState = this.hasStorageState();
    const hasBrowserProfileData = hasProfileFiles(this.paths.browserProfileDir);
    const markedLoggedIn = session?.loggedIn ?? false;
    const browserLock = getBrowserRunLockStatus(this.paths.browserLockPath);
    const headlessBrowserThrottle = getHeadlessBrowserThrottleStatus(
      this.sqlite.getMeta(HEADLESS_BROWSER_RUN_HISTORY_META_KEY)
    );
    const accessChallenge = getAccessChallengeCooldownStatus(this.sqlite.getMeta(LAST_ACCESS_CHALLENGE_META_KEY));

    return {
      dataDir: this.paths.dataDir,
      authStatePath: this.paths.authStatePath,
      browserProfileDir: this.paths.browserProfileDir,
      diagnosticsDir: this.paths.diagnosticsDir,
      browserLock,
      browserAutomation: getBrowserAutomationReadiness({
        browserLock,
        headlessBrowserThrottle,
        accessChallenge
      }),
      headlessBrowserThrottle,
      accessChallenge,
      cache: this.sqlite.userDataCacheStatus(),
      hasAuthState,
      hasBrowserProfileData,
      markedLoggedIn,
      confirmedSession: hasAuthState && hasBrowserProfileData && markedLoggedIn,
      updatedAt: session?.updatedAt
    };
  }

  hasConfirmedSession(): boolean {
    return this.status().confirmedSession;
  }

  clear(): void {
    if (existsSync(this.paths.authStatePath)) {
      rmSync(this.paths.authStatePath, { force: true });
    }

    if (existsSync(this.paths.browserProfileDir) && isWithin(this.paths.dataDir, this.paths.browserProfileDir)) {
      rmSync(this.paths.browserProfileDir, { recursive: true, force: true });
      mkdirSync(this.paths.browserProfileDir, { recursive: true });
    }

    this.sqlite.clearUserData();
    this.markLoggedOut();
  }
}

export interface SessionSnapshot {
  snapshotDir: string;
  authStatePath: string;
  browserProfileDir: string;
  hadAuthState: boolean;
  hadBrowserProfile: boolean;
}

function isWithin(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path.length > 0 && !path.startsWith("..") && !path.includes(":");
}

function isStorageState(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const state = value as { cookies?: unknown; origins?: unknown };
  const cookies = Array.isArray(state.cookies) ? state.cookies : [];
  const origins = Array.isArray(state.origins) ? state.origins : [];
  return cookies.some(isZeptoCookie) || origins.some(isZeptoOriginWithAuthStorage);
}

function isZeptoCookie(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const domain = (value as { domain?: unknown }).domain;
  return typeof domain === "string" && isZeptoHost(domain);
}

function isZeptoOriginWithAuthStorage(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const originState = value as { origin?: unknown; localStorage?: unknown };
  const origin = originState.origin;
  if (typeof origin !== "string") {
    return false;
  }

  try {
    return isZeptoHost(new URL(origin).hostname) && hasAuthLikeLocalStorage(originState.localStorage);
  } catch {
    return false;
  }
}

function hasAuthLikeLocalStorage(value: unknown): boolean {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.some((entry) => {
    if (typeof entry !== "object" || entry === null) {
      return false;
    }

    const name = (entry as { name?: unknown; key?: unknown }).name ?? (entry as { key?: unknown }).key;
    return typeof name === "string" && /(auth|session|token|jwt|user|customer|profile|phone|mobile)/i.test(name);
  });
}

function isZeptoHost(host: string): boolean {
  const normalizedHost = host.replace(/^\./, "").replace(/^www\./, "").toLowerCase();
  return ZEPTO_SESSION_HOSTS.some((knownHost) => normalizedHost === knownHost || normalizedHost.endsWith(`.${knownHost}`));
}

function hasProfileFiles(path: string): boolean {
  if (!existsSync(path)) {
    return false;
  }

  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.isFile()) {
      return true;
    }

    if (entry.isDirectory() && hasProfileFiles(join(path, entry.name))) {
      return true;
    }
  }

  return false;
}
