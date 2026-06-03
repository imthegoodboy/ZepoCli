import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import packageJson from "../package.json" with { type: "json" };
import { resolveAppPaths } from "../src/config/paths.js";
import { SessionStore } from "../src/storage/session.js";
import {
  ADDRESS_CACHE_TEXT_PREFIX,
  CART_CACHE_ITEM_PREFIX,
  ORDER_CACHE_ID_PREFIX,
  REDACTED_ADDRESS_LABEL,
  REDACTED_SEARCH_QUERY,
  SqliteStore
} from "../src/storage/sqlite.js";

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

  it("waits briefly for transient SQLite locks during same-data-dir command startup", () => {
    tempDir = mkdtempSync(join(tmpdir(), "zepo-sqlite-busy-timeout-"));
    const paths = resolveAppPaths(tempDir);
    const sqlite = new SqliteStore(paths.dbPath);

    try {
      const db = (sqlite as unknown as { db: Database.Database }).db;
      expect(db.pragma("busy_timeout", { simple: true })).toBe(5_000);
    } finally {
      sqlite.close();
    }
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

    sqlite.recordSearch(2);
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
    sqlite.saveAddresses([
      {
        label: "Home",
        text: "221B Test Street",
        selected: true
      }
    ]);
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
      version: packageJson.version,
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

    sqlite.recordSearch(2);
    sqlite.saveCartSnapshot({
      items: [
        {
          name: "Amul Milk"
        }
      ]
    });
    sqlite.saveAddresses([
      {
        label: "Home",
        text: "221B Test Street",
        selected: true
      }
    ]);
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

  it("does not persist raw search query text, cart details, address text, or raw cart/order page text in SQLite snapshots", () => {
    tempDir = mkdtempSync(join(tmpdir(), "zepo-cache-privacy-"));
    const paths = resolveAppPaths(tempDir);
    const sqlite = new SqliteStore(paths.dbPath);

    sqlite.recordSearch(4);
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
    sqlite.saveAddresses([
      {
        label: "Home",
        text: "Home: 221B Test Street, Bengaluru",
        selected: true
      },
      {
        label: "Office",
        text: "Office: 42 Test Avenue, Bengaluru",
        selected: false
      }
    ]);
    sqlite.saveOrders([
      {
        id: "ZEP1234",
        status: "Delivered",
        eta: "8 mins",
        total: "₹32",
        placedAt: "Today",
        rawText: "Order #ZEP1234 Delivered Home 221B Test Street"
      }
    ]);
    sqlite.close();

    const searchQuery = readSingleColumn(paths.dbPath, "select query as raw_text from searches limit 1");
    const cartItemsJson = readSingleColumn(paths.dbPath, "select items_json as raw_text from cart_snapshots limit 1");
    const cartTotal = readSingleColumn(paths.dbPath, "select total as raw_text from cart_snapshots limit 1");
    const cartRawText = readSingleColumn(paths.dbPath, "select raw_text from cart_snapshots limit 1");
    const addressLabels = readColumnValues(paths.dbPath, "select label as raw_text from addresses order by text");
    const addressTexts = readColumnValues(paths.dbPath, "select text as raw_text from addresses order by text");
    const orderCacheId = readSingleColumn(paths.dbPath, "select order_id as raw_text from orders limit 1");
    const orderStatus = readSingleColumn(paths.dbPath, "select status as raw_text from orders limit 1");
    const orderEta = readSingleColumn(paths.dbPath, "select eta as raw_text from orders limit 1");
    const orderTotal = readSingleColumn(paths.dbPath, "select total as raw_text from orders limit 1");
    const orderPlacedAt = readSingleColumn(paths.dbPath, "select placed_at as raw_text from orders limit 1");
    const orderRawText = readSingleColumn(paths.dbPath, "select raw_text from orders limit 1");

    expect(searchQuery).toBe(REDACTED_SEARCH_QUERY);
    expect(String(searchQuery)).not.toContain("private snacks");
    expect(cartItemsJson).toBe(JSON.stringify([{ name: `${CART_CACHE_ITEM_PREFIX}1` }]));
    expect(String(cartItemsJson)).not.toContain("Amul");
    expect(String(cartItemsJson)).not.toContain("Milk");
    expect(String(cartItemsJson)).not.toContain("500 ml");
    expect(String(cartItemsJson)).not.toContain("₹32");
    expect(cartTotal).toBeNull();
    expect(cartRawText).toBeNull();
    expect(addressLabels).toEqual([REDACTED_ADDRESS_LABEL, REDACTED_ADDRESS_LABEL]);
    expect(addressTexts).toEqual([`${ADDRESS_CACHE_TEXT_PREFIX}1`, `${ADDRESS_CACHE_TEXT_PREFIX}2`]);
    expect(JSON.stringify(addressLabels)).not.toContain("Home");
    expect(JSON.stringify(addressLabels)).not.toContain("Office");
    expect(JSON.stringify(addressTexts)).not.toContain("221B Test Street");
    expect(JSON.stringify(addressTexts)).not.toContain("42 Test Avenue");
    expect(orderCacheId).toBe(`${ORDER_CACHE_ID_PREFIX}1`);
    expect(String(orderCacheId)).not.toContain("ZEP1234");
    expect(orderStatus).toBeNull();
    expect(orderEta).toBeNull();
    expect(orderTotal).toBeNull();
    expect(orderPlacedAt).toBeNull();
    expect(orderRawText).toBe("");
    expect(String(cartRawText)).not.toContain("221B Test Street");
    expect(String(orderRawText)).not.toContain("221B Test Street");
  });

  it("replaces cached order snapshots instead of retaining stale order rows", () => {
    tempDir = mkdtempSync(join(tmpdir(), "zepo-order-cache-replace-"));
    const paths = resolveAppPaths(tempDir);
    const sqlite = new SqliteStore(paths.dbPath);

    sqlite.saveOrders([
      {
        id: "ZEP1234",
        status: "Delivered",
        rawText: "Order #ZEP1234 Delivered"
      },
      {
        id: "ZEP5678",
        status: "Cancelled",
        rawText: "Order #ZEP5678 Cancelled"
      }
    ]);
    sqlite.saveOrders([]);
    sqlite.close();

    expect(countRows(paths.dbPath, "orders")).toBe(0);
  });

  it("scrubs raw search, cart details, and order page text from existing SQLite caches during migration", () => {
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

      create table addresses (
        id integer primary key autoincrement,
        label text not null default '',
        text text not null,
        selected integer not null default 0,
        updated_at text not null,
        unique(label, text)
      );

      insert into searches (query, product_count, created_at)
      values ('private snacks 500', 4, datetime('now'));

      insert into cart_snapshots (items_json, total, raw_text, created_at)
      values ('[{"name":"Amul Milk","unit":"500 ml","price":"₹32"}]', '₹32', 'Cart Delivery address 221B Test Street', datetime('now'));

      insert into orders (order_id, status, eta, total, placed_at, raw_text, updated_at)
      values ('ZEP1234', 'Delivered', '8 mins', '₹32', 'Today', 'Order Home 221B Test Street', datetime('now'));

      insert into addresses (label, text, selected, updated_at)
      values ('Home', 'Home: 221B Test Street, Bengaluru', 1, datetime('now'));
    `);
    db.close();

    const sqlite = new SqliteStore(paths.dbPath);
    sqlite.close();

    expect(readSingleColumn(paths.dbPath, "select query as raw_text from searches limit 1")).toBe(
      REDACTED_SEARCH_QUERY
    );
    expect(readSingleColumn(paths.dbPath, "select items_json as raw_text from cart_snapshots limit 1")).toBe("[]");
    expect(readSingleColumn(paths.dbPath, "select total as raw_text from cart_snapshots limit 1")).toBeNull();
    expect(readSingleColumn(paths.dbPath, "select raw_text from cart_snapshots limit 1")).toBeNull();
    const migratedOrderId = readSingleColumn(paths.dbPath, "select order_id as raw_text from orders limit 1");
    expect(migratedOrderId).toMatch(new RegExp(`^${ORDER_CACHE_ID_PREFIX}legacy-\\d+$`));
    expect(String(migratedOrderId)).not.toContain("ZEP1234");
    expect(readSingleColumn(paths.dbPath, "select status as raw_text from orders limit 1")).toBeNull();
    expect(readSingleColumn(paths.dbPath, "select eta as raw_text from orders limit 1")).toBeNull();
    expect(readSingleColumn(paths.dbPath, "select total as raw_text from orders limit 1")).toBeNull();
    expect(readSingleColumn(paths.dbPath, "select placed_at as raw_text from orders limit 1")).toBeNull();
    expect(readSingleColumn(paths.dbPath, "select raw_text from orders limit 1")).toBe("");
    expect(readSingleColumn(paths.dbPath, "select label as raw_text from addresses limit 1")).toBe(
      REDACTED_ADDRESS_LABEL
    );
    expect(readSingleColumn(paths.dbPath, "select text as raw_text from addresses limit 1")).toBe(
      `${ADDRESS_CACHE_TEXT_PREFIX}1`
    );
  });

  it("removes raw cart fields from legacy marker-prefixed cart cache rows during migration", () => {
    tempDir = mkdtempSync(join(tmpdir(), "zepo-cart-cache-marker-migration-"));
    const paths = resolveAppPaths(tempDir);
    const db = new Database(paths.dbPath);
    db.exec(`
      create table cart_snapshots (
        id integer primary key autoincrement,
        items_json text not null,
        total text,
        raw_text text,
        created_at text not null
      );

      insert into cart_snapshots (items_json, total, raw_text, created_at)
      values
        ('[{"name":"cache-cart-item-1","unit":"500 ml","price":"₹32"},{"name":"Amul Milk","unit":"1 L"}]', '₹90', 'Cart Amul Milk 500 ml', datetime('now')),
        ('not-json', '₹10', 'Cart raw text', datetime('now'));
    `);
    db.close();

    const sqlite = new SqliteStore(paths.dbPath);
    sqlite.close();

    const cartItemsJson = readColumnValues(
      paths.dbPath,
      "select items_json as raw_text from cart_snapshots order by id"
    );
    const cartTotals = readColumnValues(paths.dbPath, "select coalesce(total, '') as raw_text from cart_snapshots order by id");
    const cartRawTexts = readColumnValues(
      paths.dbPath,
      "select coalesce(raw_text, '') as raw_text from cart_snapshots order by id"
    );

    expect(cartItemsJson).toEqual([
      JSON.stringify([{ name: `${CART_CACHE_ITEM_PREFIX}1` }, { name: `${CART_CACHE_ITEM_PREFIX}2` }]),
      "[]"
    ]);
    expect(JSON.stringify(cartItemsJson)).not.toContain("Amul");
    expect(JSON.stringify(cartItemsJson)).not.toContain("500 ml");
    expect(JSON.stringify(cartItemsJson)).not.toContain("₹32");
    expect(cartTotals).toEqual(["", ""]);
    expect(cartRawTexts).toEqual(["", ""]);
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

  it("accepts strong Zepto auth keys even when they include delivery or location wording", () => {
    tempDir = mkdtempSync(join(tmpdir(), "zepo-strong-auth-"));
    const paths = resolveAppPaths(tempDir);
    const sqlite = new SqliteStore(paths.dbPath);
    const session = new SessionStore(paths, sqlite);

    writeFileSync(
      paths.authStatePath,
      JSON.stringify({
        cookies: [
          {
            name: "deliverySessionToken",
            value: "redacted",
            domain: "www.zepto.com",
            path: "/"
          }
        ],
        origins: []
      })
    );

    expect(session.hasStorageState()).toBe(true);
    expect(session.status().hasAuthState).toBe(true);

    writeFileSync(
      paths.authStatePath,
      JSON.stringify({
        cookies: [],
        origins: [
          {
            origin: "https://www.zepto.com",
            localStorage: [
              {
                name: "selectedLocationAuthToken",
                value: "redacted"
              }
            ]
          }
        ]
      })
    );

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
              },
              {
                name: "userLocation",
                value: "Bengaluru"
              },
              {
                name: "customer_preferred_store",
                value: "store-1"
              },
              {
                name: "profileDeliveryAddress",
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

  it("does not treat public Zepto cookies as saved auth state", () => {
    tempDir = mkdtempSync(join(tmpdir(), "zepo-public-cookie-auth-"));
    const paths = resolveAppPaths(tempDir);
    const sqlite = new SqliteStore(paths.dbPath);
    const session = new SessionStore(paths, sqlite);

    writeFileSync(
      paths.authStatePath,
      JSON.stringify({
        cookies: [
          {
            name: "selectedLocation",
            value: "Bengaluru",
            domain: "www.zepto.com",
            path: "/"
          },
          {
            name: "pincode",
            value: "560001",
            domain: ".zeptonow.com",
            path: "/"
          },
          {
            name: "userLocation",
            value: "Bengaluru",
            domain: "www.zepto.com",
            path: "/"
          },
          {
            name: "customer_preferred_store",
            value: "store-1",
            domain: ".zeptonow.com",
            path: "/"
          },
          {
            name: "profileDeliveryAddress",
            value: "Bengaluru",
            domain: "www.zepto.com",
            path: "/"
          }
        ],
        origins: []
      })
    );

    expect(session.hasStorageState()).toBe(false);
    expect(session.status().hasAuthState).toBe(false);
    sqlite.close();
  });

  it("does not treat weak profile or contact storage keys as saved auth state", () => {
    tempDir = mkdtempSync(join(tmpdir(), "zepo-weak-profile-auth-"));
    const paths = resolveAppPaths(tempDir);
    const sqlite = new SqliteStore(paths.dbPath);
    const session = new SessionStore(paths, sqlite);

    writeFileSync(
      paths.authStatePath,
      JSON.stringify({
        cookies: [
          {
            name: "customerProfile",
            value: "profile-data",
            domain: "www.zepto.com",
            path: "/"
          },
          {
            name: "phoneNumber",
            value: "present",
            domain: ".zeptonow.com",
            path: "/"
          },
          {
            name: "identity",
            value: "customer",
            domain: "www.zepto.com",
            path: "/"
          }
        ],
        origins: [
          {
            origin: "https://www.zepto.com",
            localStorage: [
              {
                name: "customerProfile",
                value: "profile-data"
              },
              {
                name: "mobileNumber",
                value: "present"
              },
              {
                name: "identity",
                value: "customer"
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

  it("does not treat bare login or logged UI flags as saved auth state", () => {
    tempDir = mkdtempSync(join(tmpdir(), "zepo-login-flag-auth-"));
    const paths = resolveAppPaths(tempDir);
    const sqlite = new SqliteStore(paths.dbPath);
    const session = new SessionStore(paths, sqlite);

    writeFileSync(
      paths.authStatePath,
      JSON.stringify({
        cookies: [
          {
            name: "loginModalSeen",
            value: "true",
            domain: "www.zepto.com",
            path: "/"
          },
          {
            name: "loggedOut",
            value: "false",
            domain: ".zeptonow.com",
            path: "/"
          }
        ],
        origins: [
          {
            origin: "https://www.zepto.com",
            localStorage: [
              {
                name: "isLoggedIn",
                value: "true"
              },
              {
                name: "lastLoginPrompt",
                value: "2026-06-03"
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

  it("does not treat CSRF or XSRF tokens as saved auth state", () => {
    tempDir = mkdtempSync(join(tmpdir(), "zepo-csrf-token-auth-"));
    const paths = resolveAppPaths(tempDir);
    const sqlite = new SqliteStore(paths.dbPath);
    const session = new SessionStore(paths, sqlite);

    writeFileSync(
      paths.authStatePath,
      JSON.stringify({
        cookies: [
          {
            name: "XSRF-TOKEN",
            value: "present",
            domain: "www.zepto.com",
            path: "/"
          },
          {
            name: "csrfToken",
            value: "present",
            domain: ".zeptonow.com",
            path: "/"
          }
        ],
        origins: [
          {
            origin: "https://www.zepto.com",
            localStorage: [
              {
                name: "antiForgeryToken",
                value: "present"
              },
              {
                name: "requestVerificationToken",
                value: "present"
              }
            ]
          }
        ]
      })
    );
    mkdirSync(join(paths.browserProfileDir, "Default"), { recursive: true });
    writeFileSync(join(paths.browserProfileDir, "Default", "Cookies"), "cookie-data");
    session.markLoggedIn();

    expect(session.hasStorageState()).toBe(false);
    expect(session.status()).toMatchObject({
      hasAuthState: false,
      hasBrowserProfileData: true,
      markedLoggedIn: true,
      confirmedSession: false
    });
    sqlite.close();
  });

  it("does not treat empty auth-like Zepto cookie or localStorage values as saved auth state", () => {
    tempDir = mkdtempSync(join(tmpdir(), "zepo-empty-auth-values-"));
    const paths = resolveAppPaths(tempDir);
    const sqlite = new SqliteStore(paths.dbPath);
    const session = new SessionStore(paths, sqlite);

    writeFileSync(
      paths.authStatePath,
      JSON.stringify({
        cookies: [
          {
            name: "sid",
            value: "   ",
            domain: "www.zepto.com",
            path: "/"
          }
        ],
        origins: [
          {
            origin: "https://www.zepto.com",
            localStorage: [
              {
                name: "authToken",
                value: ""
              },
              {
                name: "sessionToken",
                value: "   "
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

function readColumnValues(dbPath: string, sql: string): string[] {
  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db.prepare(sql).all() as Array<{ raw_text: string }>;
    return rows.map((row) => row.raw_text);
  } finally {
    db.close();
  }
}

function readAuthState(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}
