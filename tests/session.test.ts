import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { resolveAppPaths } from "../src/config/paths.js";
import { SessionStore } from "../src/storage/session.js";
import { REDACTED_SEARCH_QUERY, SqliteStore } from "../src/storage/sqlite.js";

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
      localStorage: [
        {
          name: "authToken",
          value: "redacted"
        }
      ]
    }
  ]
});

const LEGACY_ZEPTONOW_COOKIE_AUTH_STATE = JSON.stringify({
  cookies: [
    {
      name: "sid",
      value: "1",
      domain: ".zeptonow.com",
      path: "/",
      expires: -1,
      httpOnly: true,
      secure: true,
      sameSite: "Lax"
    }
  ],
  origins: []
});

const LEGACY_ZEPTONOW_ORIGIN_AUTH_STATE = JSON.stringify({
  cookies: [],
  origins: [
    {
      origin: "https://www.zeptonow.com",
      localStorage: [
        {
          name: "authToken",
          value: "redacted"
        }
      ]
    }
  ]
});

const EMPTY_ZEPTO_ORIGIN_STATE = JSON.stringify({
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

  it("restores saved auth state and browser profile data from a session snapshot", () => {
    tempDir = mkdtempSync(join(tmpdir(), "zepo-session-snapshot-"));
    const paths = resolveAppPaths(tempDir);
    const sqlite = new SqliteStore(paths.dbPath);
    const session = new SessionStore(paths, sqlite);

    writeFileSync(paths.authStatePath, AUTH_STATE);
    mkdirSync(join(paths.browserProfileDir, "Default"), { recursive: true });
    writeFileSync(join(paths.browserProfileDir, "Default", "Cookies"), "old-cookie-data");

    const snapshot = session.createSnapshot();
    writeFileSync(paths.authStatePath, "{\"cookies\":[],\"origins\":[]}");
    writeFileSync(join(paths.browserProfileDir, "Default", "Cookies"), "new-cookie-data");
    writeFileSync(join(paths.browserProfileDir, "Default", "Local Storage"), "new-local-storage");

    session.restoreSnapshot(snapshot);
    session.disposeSnapshot(snapshot);
    sqlite.close();

    expect(readAuthState(paths.authStatePath)).toEqual(JSON.parse(AUTH_STATE));
    expect(existsSync(join(paths.browserProfileDir, "Default", "Local Storage"))).toBe(false);
    expect(existsSync(snapshot.snapshotDir)).toBe(false);
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
      browserLock: {
        path: paths.browserLockPath,
        present: false,
        stale: false
      },
      browserAutomation: {
        ready: true,
        reasons: [],
        retryAfterMs: 0
      },
      headlessBrowserThrottle: {
        windowMs: 600_000,
        limit: 8,
        recentRuns: 0,
        throttleActive: false,
        retryAfterMs: 0
      },
      hasAuthState: true,
      hasBrowserProfileData: true,
      markedLoggedIn: true,
      confirmedSession: true,
      cache: {
        searches: 0,
        cartSnapshots: 0,
        addresses: 0,
        orders: 0
      }
    });
    expect(status.updatedAt).toBeTypeOf("string");
  });

  it("reports local user metadata cache counts without affecting session confirmation", () => {
    tempDir = mkdtempSync(join(tmpdir(), "zepo-status-cache-"));
    const paths = resolveAppPaths(tempDir);
    const sqlite = new SqliteStore(paths.dbPath);
    const session = new SessionStore(paths, sqlite);

    sqlite.recordSearch("milk", 2);
    sqlite.saveCartSnapshot({
      items: [
        {
          name: "Amul Milk"
        }
      ]
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
        rawText: "Order #ZEP1234 Delivered"
      }
    ]);

    const status = session.status();
    sqlite.close();

    expect(status.confirmedSession).toBe(false);
    expect(status.cache).toEqual({
      searches: 1,
      cartSnapshots: 1,
      addresses: 1,
      orders: 1
    });
  });

  it("does not persist raw search query text or raw cart/order page text in SQLite snapshots", () => {
    tempDir = mkdtempSync(join(tmpdir(), "zepo-cache-privacy-"));
    const paths = resolveAppPaths(tempDir);
    const sqlite = new SqliteStore(paths.dbPath);

    sqlite.recordSearch("private snacks 500", 4);
    sqlite.saveCartSnapshot({
      items: [
        {
          name: "Amul Milk",
          unit: "500 ml",
          price: "₹32"
        }
      ],
      total: "₹32",
      rawText: "Cart Amul Milk 500 ml ₹32 Delivery address 221B Test Street"
    });
    sqlite.saveOrders([
      {
        id: "ZEP1234",
        status: "Delivered",
        total: "₹32",
        rawText: "Order #ZEP1234 Delivered Home 221B Test Street"
      }
    ]);
    sqlite.close();

    const searchQuery = readSingleColumn(paths.dbPath, "select query as raw_text from searches limit 1");
    const cartRawText = readSingleColumn(paths.dbPath, "select raw_text from cart_snapshots limit 1");
    const orderRawText = readSingleColumn(paths.dbPath, "select raw_text from orders where order_id = 'ZEP1234'");

    expect(searchQuery).toBe(REDACTED_SEARCH_QUERY);
    expect(String(searchQuery)).not.toContain("private snacks");
    expect(cartRawText).toBeNull();
    expect(orderRawText).toBe("");
    expect(String(cartRawText)).not.toContain("221B Test Street");
    expect(String(orderRawText)).not.toContain("221B Test Street");
  });

  it("scrubs raw search, cart, and order page text from existing SQLite caches during migration", () => {
    tempDir = mkdtempSync(join(tmpdir(), "zepo-cache-migration-"));
    const paths = resolveAppPaths(tempDir);
    const db = new Database(paths.dbPath);
    db.exec(`
      create table searches (
        id integer primary key autoincrement,
        query text not null,
        product_count integer not null,
        created_at text not null
      );

      create table cart_snapshots (
        id integer primary key autoincrement,
        items_json text not null,
        total text,
        raw_text text,
        created_at text not null
      );

      create table orders (
        order_id text primary key,
        status text,
        eta text,
        total text,
        placed_at text,
        raw_text text not null,
        updated_at text not null
      );

      insert into searches (query, product_count, created_at)
      values ('private snacks 500', 4, datetime('now'));

      insert into cart_snapshots (items_json, total, raw_text, created_at)
      values ('[]', '₹32', 'Cart Delivery address 221B Test Street', datetime('now'));

      insert into orders (order_id, status, eta, total, placed_at, raw_text, updated_at)
      values ('ZEP1234', 'Delivered', null, '₹32', null, 'Order Home 221B Test Street', datetime('now'));
    `);
    db.close();

    const sqlite = new SqliteStore(paths.dbPath);
    sqlite.close();

    expect(readSingleColumn(paths.dbPath, "select query as raw_text from searches limit 1")).toBe(
      REDACTED_SEARCH_QUERY
    );
    expect(readSingleColumn(paths.dbPath, "select raw_text from cart_snapshots limit 1")).toBeNull();
    expect(readSingleColumn(paths.dbPath, "select raw_text from orders where order_id = 'ZEP1234'")).toBe("");
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

  it("accepts Zepto origins with auth-like storage in saved auth state", () => {
    tempDir = mkdtempSync(join(tmpdir(), "zepo-origin-auth-"));
    const paths = resolveAppPaths(tempDir);
    const sqlite = new SqliteStore(paths.dbPath);
    const session = new SessionStore(paths, sqlite);

    writeFileSync(paths.authStatePath, ZEPTO_ORIGIN_AUTH_STATE);

    expect(session.hasStorageState()).toBe(true);
    expect(session.status().hasAuthState).toBe(true);
    sqlite.close();
  });

  it("accepts legacy ZeptoNow auth state as Zepto session evidence", () => {
    tempDir = mkdtempSync(join(tmpdir(), "zepo-legacy-auth-"));
    const paths = resolveAppPaths(tempDir);
    const sqlite = new SqliteStore(paths.dbPath);
    const session = new SessionStore(paths, sqlite);

    writeFileSync(paths.authStatePath, LEGACY_ZEPTONOW_COOKIE_AUTH_STATE);

    expect(session.hasStorageState()).toBe(true);
    expect(session.status().hasAuthState).toBe(true);

    writeFileSync(paths.authStatePath, LEGACY_ZEPTONOW_ORIGIN_AUTH_STATE);

    expect(session.hasStorageState()).toBe(true);
    expect(session.status().hasAuthState).toBe(true);
    sqlite.close();
  });

  it("does not treat empty Zepto origin storage as saved auth state", () => {
    tempDir = mkdtempSync(join(tmpdir(), "zepo-empty-origin-auth-"));
    const paths = resolveAppPaths(tempDir);
    const sqlite = new SqliteStore(paths.dbPath);
    const session = new SessionStore(paths, sqlite);

    writeFileSync(paths.authStatePath, EMPTY_ZEPTO_ORIGIN_STATE);

    expect(session.hasStorageState()).toBe(false);
    expect(session.status().hasAuthState).toBe(false);
    sqlite.close();
  });

  it("does not treat public Zepto preference storage as saved auth state", () => {
    tempDir = mkdtempSync(join(tmpdir(), "zepo-public-origin-auth-"));
    const paths = resolveAppPaths(tempDir);
    const sqlite = new SqliteStore(paths.dbPath);
    const session = new SessionStore(paths, sqlite);

    writeFileSync(
      paths.authStatePath,
      JSON.stringify({
        cookies: [],
        origins: [
          {
            origin: "https://www.zepto.com",
            localStorage: [
              {
                name: "selectedLocation",
                value: "Bengaluru"
              }
            ]
          }
        ]
      })
    );

    expect(session.hasStorageState()).toBe(false);
    expect(session.status().hasAuthState).toBe(false);
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

function readSingleColumn(dbPath: string, sql: string): string | null {
  const db = new Database(dbPath, { readonly: true });
  try {
    const row = db.prepare(sql).get() as { raw_text: string | null };
    return row.raw_text;
  } finally {
    db.close();
  }
}

function readAuthState(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}
