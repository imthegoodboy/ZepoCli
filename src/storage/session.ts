import { existsSync, rmSync, statSync } from "node:fs";

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
    this.markLoggedOut();
  }
}
