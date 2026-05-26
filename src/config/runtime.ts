import pino from "pino";

import { DEFAULT_TIMEOUT_MS } from "./constants.js";
import { type AppPaths, resolveAppPaths } from "./paths.js";
import { PreferencesStore } from "../storage/preferences.js";
import { SessionStore } from "../storage/session.js";
import { SqliteStore } from "../storage/sqlite.js";
import type { RuntimeOptions } from "../types.js";

export interface AppRuntime {
  paths: AppPaths;
  sqlite: SqliteStore;
  session: SessionStore;
  preferences: PreferencesStore;
  logger: pino.Logger;
  options: RuntimeOptions;
}

export function createRuntime(options: Partial<RuntimeOptions> = {}): AppRuntime {
  const runtimeOptions: RuntimeOptions = {
    dataDir: options.dataDir,
    debug: options.debug ?? false,
    headless: options.headless ?? true,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  };

  const paths = resolveAppPaths(runtimeOptions.dataDir);
  const sqlite = new SqliteStore(paths.dbPath);
  const session = new SessionStore(paths, sqlite);
  const preferences = new PreferencesStore(sqlite);
  const logger = pino(
    {
      level: runtimeOptions.debug ? "debug" : "info",
      base: undefined
    },
    pino.destination(paths.logPath)
  );

  return {
    paths,
    sqlite,
    session,
    preferences,
    logger,
    options: runtimeOptions
  };
}
