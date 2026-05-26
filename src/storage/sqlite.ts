import Database from "better-sqlite3";

import type { Address, CartSnapshot, OrderSnapshot } from "../types.js";

export class SqliteStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  setMeta(key: string, value: string): void {
    this.db
      .prepare(
        `insert into meta (key, value, updated_at)
         values (?, ?, datetime('now'))
         on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at`
      )
      .run(key, value);
  }

  getMeta(key: string): string | undefined {
    const row = this.db.prepare("select value from meta where key = ?").get(key) as
      | { value: string }
      | undefined;
    return row?.value;
  }

  markSession(loggedIn: boolean, storageStatePath: string): void {
    this.db
      .prepare(
        `insert into sessions (id, logged_in, storage_state_path, updated_at)
         values ('default', ?, ?, datetime('now'))
         on conflict(id) do update set
           logged_in = excluded.logged_in,
           storage_state_path = excluded.storage_state_path,
           updated_at = excluded.updated_at`
      )
      .run(loggedIn ? 1 : 0, storageStatePath);
  }

  recordSearch(query: string, productCount: number): void {
    this.db
      .prepare("insert into searches (query, product_count, created_at) values (?, ?, datetime('now'))")
      .run(query, productCount);
  }

  saveCartSnapshot(snapshot: CartSnapshot): void {
    this.db
      .prepare("insert into cart_snapshots (items_json, total, raw_text, created_at) values (?, ?, ?, datetime('now'))")
      .run(JSON.stringify(snapshot.items), snapshot.total ?? null, snapshot.rawText ?? null);
  }

  upsertAddress(address: Address): void {
    const label = address.label ?? "";
    this.db
      .prepare(
        `insert into addresses (label, text, selected, updated_at)
         values (?, ?, ?, datetime('now'))
         on conflict(label, text) do update set
           selected = excluded.selected,
           updated_at = excluded.updated_at`
      )
      .run(label, address.text, address.selected ? 1 : 0);
  }

  listCachedAddresses(): Address[] {
    const rows = this.db
      .prepare("select label, text, selected from addresses order by selected desc, updated_at desc")
      .all() as Array<{ label: string; text: string; selected: number }>;

    return rows.map((row) => ({
      label: row.label || undefined,
      text: row.text,
      selected: row.selected === 1
    }));
  }

  saveOrders(orders: OrderSnapshot[]): void {
    const statement = this.db.prepare(
      `insert into orders (order_id, status, eta, total, placed_at, raw_text, updated_at)
       values (?, ?, ?, ?, ?, ?, datetime('now'))
       on conflict(order_id) do update set
         status = excluded.status,
         eta = excluded.eta,
         total = excluded.total,
         placed_at = excluded.placed_at,
         raw_text = excluded.raw_text,
         updated_at = excluded.updated_at`
    );

    const save = this.db.transaction((items: OrderSnapshot[]) => {
      for (const [index, order] of items.entries()) {
        statement.run(
          order.id ?? `latest-${index}`,
          order.status ?? null,
          order.eta ?? null,
          order.total ?? null,
          order.placedAt ?? null,
          order.rawText
        );
      }
    });

    save(orders);
  }

  private migrate(): void {
    this.db.exec(`
      create table if not exists meta (
        key text primary key,
        value text not null,
        updated_at text not null
      );

      create table if not exists sessions (
        id text primary key,
        logged_in integer not null default 0,
        storage_state_path text not null,
        updated_at text not null
      );

      create table if not exists searches (
        id integer primary key autoincrement,
        query text not null,
        product_count integer not null,
        created_at text not null
      );

      create table if not exists cart_snapshots (
        id integer primary key autoincrement,
        items_json text not null,
        total text,
        raw_text text,
        created_at text not null
      );

      create table if not exists addresses (
        id integer primary key autoincrement,
        label text not null default '',
        text text not null,
        selected integer not null default 0,
        updated_at text not null,
        unique(label, text)
      );

      create table if not exists orders (
        order_id text primary key,
        status text,
        eta text,
        total text,
        placed_at text,
        raw_text text not null,
        updated_at text not null
      );
    `);
  }
}
