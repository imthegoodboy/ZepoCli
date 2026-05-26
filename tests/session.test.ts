import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resolveAppPaths } from "../src/config/paths.js";
import { SessionStore } from "../src/storage/session.js";
import { SqliteStore } from "../src/storage/sqlite.js";

describe("session storage", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("creates auth state and browser profile paths under the data directory", () => {
    tempDir = mkdtempSync(join(tmpdir(), "zepo-paths-"));
    const paths = resolveAppPaths(tempDir);

    expect(paths.authStatePath.startsWith(paths.dataDir)).toBe(true);
    expect(paths.browserProfileDir.startsWith(paths.dataDir)).toBe(true);
    expect(paths.diagnosticsDir.startsWith(paths.dataDir)).toBe(true);
    expect(existsSync(paths.browserProfileDir)).toBe(true);
    expect(existsSync(paths.diagnosticsDir)).toBe(true);
  });

  it("clears saved auth state and persistent browser profile data on logout", () => {
    tempDir = mkdtempSync(join(tmpdir(), "zepo-session-"));
    const paths = resolveAppPaths(tempDir);
    const sqlite = new SqliteStore(paths.dbPath);
    const session = new SessionStore(paths, sqlite);

    writeFileSync(paths.authStatePath, "{}");
    mkdirSync(join(paths.browserProfileDir, "Default"), { recursive: true });
    writeFileSync(join(paths.browserProfileDir, "Default", "Cookies"), "cookie-data");

    session.clear();
    sqlite.close();

    expect(existsSync(paths.authStatePath)).toBe(false);
    expect(existsSync(paths.browserProfileDir)).toBe(true);
    expect(existsSync(join(paths.browserProfileDir, "Default", "Cookies"))).toBe(false);
  });
});
