import type { Address } from "../types.js";
import type { SqliteStore } from "./sqlite.js";

export class PreferencesStore {
  constructor(private readonly sqlite: SqliteStore) {}

  saveAddresses(addresses: Address[]): void {
    this.sqlite.saveAddresses(addresses);
  }

  cachedAddresses(): Address[] {
    return this.sqlite.listCachedAddresses();
  }
}
