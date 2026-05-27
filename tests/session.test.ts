import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { resolveAppPaths } from "../src/config/paths.js";
import { SessionStore } from "../src/storage/session.js";
import { SqliteStore } from "../src/storage/sqlite.js";

const AUTH_STATE = JSON.stringify({
  cookies: [
    {
      name: "sid",
      value: "1",
      domain: "www.zepto.com",
      path: "/",
      expires: -1,
      httpOnly: true,
      secure: true,
      sameSite: "Lax"
    }
  ],
  origins: []
});

const ZEPTO_ORIGIN_AUTH_STATE = JSON.stringify({
  cookies: [],
  origins: [
    {
      origin: "https://www.zepto.com",
      localStorage: []
    }
  ]
});

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

  it("clears cached user metadata on logout", () => {
    tempDir = mkdtempSync(join(tmpdir(), "zepo-session-cache-"));
    const paths = resolveAppPaths(tempDir);
    const sqlite = new SqliteStore(paths.dbPath);
    const session = new SessionStore(paths, sqlite);

    sqlite.recordSearch("milk", 2);
    sqlite.saveCartSnapshot({
      items: [
        {
          name: "Amul Milk",
          unit: "500 ml",
          price: "₹32"
        }
      ],
      total: "₹32",
      rawText: "Cart Amul Milk 500 ml ₹32"
    });
    sqlite.upsertAddress({
      label: "Home",
      text: "221B Test Street",
      selected: true
    });
    sqlite.saveOrders([
      {
        id: "ZEP1234",
        status: "Delivered",
        rawText: "Order #ZEP1234 Delivered Total ₹32"
      }
    ]);

    session.clear();
    sqlite.close();

    expect(countRows(paths.dbPath, "searches")).toBe(0);
    expect(countRows(paths.dbPath, "cart_snapshots")).toBe(0);
    expect(countRows(paths.dbPath, "addresses")).toBe(0);
    expect(countRows(paths.dbPath, "orders")).toBe(0);
    expect(countRows(paths.dbPath, "sessions")).toBe(1);
  });

  it("reports session status without requiring a live browser", () => {
    tempDir = mkdtempSync(join(tmpdir(), "zepo-status-"));
    const paths = resolveAppPaths(tempDir);
    const sqlite = new SqliteStore(paths.dbPath);
    const session = new SessionStore(paths, sqlite);

    writeFileSync(paths.authStatePath, AUTH_STATE);
    mkdirSync(join(paths.browserProfileDir, "Default"), { recursive: true });
    writeFileSync(join(paths.browserProfileDir, "Default", "Cookies"), "cookie-data");
    session.markLoggedIn();

    const status = session.status();
    sqlite.close();

    expect(status).toMatchObject({
      dataDir: paths.dataDir,
      authStatePath: paths.authStatePath,
      browserProfileDir: paths.browserProfileDir,
      diagnosticsDir: paths.diagnosticsDir,
      hasAuthState: true,
      hasBrowserProfileData: true,
      markedLoggedIn: true,
      confirmedSession: true
    });
    expect(status.updatedAt).toBeTypeOf("string");
  });

  it("requires auth state, browser profile data, and confirmed login for a usable session", () => {
    tempDir = mkdtempSync(join(tmpdir(), "zepo-confirmed-session-"));
    const paths = resolveAppPaths(tempDir);
    const sqlite = new SqliteStore(paths.dbPath);
    const session = new SessionStore(paths, sqlite);

    writeFileSync(paths.authStatePath, AUTH_STATE);
    session.markLoggedIn();
    expect(session.hasConfirmedSession()).toBe(false);

    mkdirSync(join(paths.browserProfileDir, "Default"), { recursive: true });
    writeFileSync(join(paths.browserProfileDir, "Default", "Cookies"), "cookie-data");

    expect(session.hasConfirmedSession()).toBe(true);
    sqlite.close();
  });

  it("does not treat corrupt auth state as present", () => {
    tempDir = mkdtempSync(join(tmpdir(), "zepo-corrupt-auth-"));
    const paths = resolveAppPaths(tempDir);
    const sqlite = new SqliteStore(paths.dbPath);
    const session = new SessionStore(paths, sqlite);

    writeFileSync(paths.authStatePath, "not-json");

    expect(session.hasStorageState()).toBe(false);
    expect(session.status().hasAuthState).toBe(false);
    sqlite.close();
  });

  it("does not treat empty auth state as present", () => {
    tempDir = mkdtempSync(join(tmpdir(), "zepo-empty-auth-"));
    const paths = resolveAppPaths(tempDir);
    const sqlite = new SqliteStore(paths.dbPath);
    const session = new SessionStore(paths, sqlite);

    writeFileSync(paths.authStatePath, "{\"cookies\":[],\"origins\":[]}");

    expect(session.hasStorageState()).toBe(false);
    expect(session.status().hasAuthState).toBe(false);
    sqlite.close();
  });

  it("accepts Zepto origins in saved auth state", () => {
    tempDir = mkdtempSync(join(tmpdir(), "zepo-origin-auth-"));
    const paths = resolveAppPaths(tempDir);
    const sqlite = new SqliteStore(paths.dbPath);
    const session = new SessionStore(paths, sqlite);

    writeFileSync(paths.authStatePath, ZEPTO_ORIGIN_AUTH_STATE);

    expect(session.hasStorageState()).toBe(true);
    expect(session.status().hasAuthState).toBe(true);
    sqlite.close();
  });

  it("does not treat unrelated storage state as Zepto auth state", () => {
    tempDir = mkdtempSync(join(tmpdir(), "zepo-unrelated-auth-"));
    const paths = resolveAppPaths(tempDir);
    const sqlite = new SqliteStore(paths.dbPath);
    const session = new SessionStore(paths, sqlite);

    writeFileSync(
      paths.authStatePath,
      JSON.stringify({
        cookies: [
          {
            name: "sid",
            value: "1",
            domain: "example.com",
            path: "/"
          }
        ],
        origins: [
          {
            origin: "https://example.com",
            localStorage: []
          }
        ]
      })
    );

    expect(session.hasStorageState()).toBe(false);
    expect(session.status().hasAuthState).toBe(false);
    sqlite.close();
  });

  it("does not treat empty browser profile directories as profile data", () => {
    tempDir = mkdtempSync(join(tmpdir(), "zepo-empty-profile-"));
    const paths = resolveAppPaths(tempDir);
    const sqlite = new SqliteStore(paths.dbPath);
    const session = new SessionStore(paths, sqlite);

    writeFileSync(paths.authStatePath, AUTH_STATE);
    mkdirSync(join(paths.browserProfileDir, "Default"), { recursive: true });
    session.markLoggedIn();

    const status = session.status();
    const confirmed = session.hasConfirmedSession();
    sqlite.close();

    expect(status.hasAuthState).toBe(true);
    expect(status.hasBrowserProfileData).toBe(false);
    expect(status.markedLoggedIn).toBe(true);
    expect(status.confirmedSession).toBe(false);
    expect(confirmed).toBe(false);
  });
});

function countRows(dbPath: string, table: string): number {
  const db = new Database(dbPath, { readonly: true });
  try {
    const row = db.prepare(`select count(*) as count from ${table}`).get() as { count: number };
    return row.count;
  } finally {
    db.close();
  }
}
