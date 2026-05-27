import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import type { AppPaths } from "../config/paths.js";
import type { SessionStatus } from "../types.js";
import type { SqliteStore } from "./sqlite.js";

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

  status(): SessionStatus {
    const session = this.sqlite.getSession();
    const hasAuthState = this.hasStorageState();
    const hasBrowserProfileData = hasProfileFiles(this.paths.browserProfileDir);
    const markedLoggedIn = session?.loggedIn ?? false;

    return {
      dataDir: this.paths.dataDir,
      authStatePath: this.paths.authStatePath,
      browserProfileDir: this.paths.browserProfileDir,
      diagnosticsDir: this.paths.diagnosticsDir,
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

    this.markLoggedOut();
  }
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
  return cookies.length > 0 || origins.length > 0;
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
