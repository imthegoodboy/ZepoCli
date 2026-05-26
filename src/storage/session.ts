import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { relative } from "node:path";

import type { AppPaths } from "../config/paths.js";
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

    return statSync(this.paths.authStatePath).size > 2;
  }

  markLoggedIn(): void {
    this.sqlite.markSession(true, this.paths.authStatePath);
  }

  markLoggedOut(): void {
    this.sqlite.markSession(false, this.paths.authStatePath);
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
