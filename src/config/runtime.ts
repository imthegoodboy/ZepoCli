import pino from "pino";

import { DEFAULT_TIMEOUT_MS } from "./constants.js";
import { type AppPaths, resolveAppPaths } from "./paths.js";
import { PreferencesStore } from "../storage/preferences.js";
import { SessionStore } from "../storage/session.js";
import { SqliteStore } from "../storage/sqlite.js";
import type { RuntimeOptions } from "../types.js";
import { redactSensitiveValue } from "../utils/redaction.js";

export interface AppRuntime {
  paths: AppPaths;
  sqlite: SqliteStore;
  session: SessionStore;
  preferences: PreferencesStore;
  logger: pino.Logger;
  logDestination: ReturnType<typeof pino.destination>;
  options: RuntimeOptions;
}

export function createRuntime(options: Partial<RuntimeOptions> = {}): AppRuntime {
  const runtimeOptions: RuntimeOptions = {
    dataDir: options.dataDir,
    debug: options.debug ?? false,
    headless: options.headless ?? true,
    interactive: options.interactive ?? true,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  };

  const paths = resolveAppPaths(runtimeOptions.dataDir);
  const sqlite = new SqliteStore(paths.dbPath);
  const session = new SessionStore(paths, sqlite);
  const preferences = new PreferencesStore(sqlite);
  const logDestination = pino.destination(paths.logPath);
  const logger = pino(
    {
      level: runtimeOptions.debug ? "debug" : "info",
      base: undefined,
      formatters: {
        log(object) {
          return redactSensitiveValue(object) as Record<string, unknown>;
        }
      },
      hooks: {
        logMethod(args, method) {
          method.apply(this, args.map(redactSensitiveValue) as Parameters<typeof method>);
        }
      }
    },
    logDestination
  );

  return {
    paths,
    sqlite,
    session,
    preferences,
    logger,
    logDestination,
    options: runtimeOptions
  };
}

export function closeRuntime(runtime: AppRuntime): void {
  runtime.sqlite.close();
  runtime.logDestination.flushSync();
  runtime.logDestination.end();
}

export function closeRuntimeBestEffort(runtime: AppRuntime): void {
  try {
    runtime.sqlite.close();
  } catch {
    // Runtime cleanup must not replace the command's real result or user-facing error.
  }

  try {
    runtime.logDestination.flushSync();
  } catch {
    // SonicBoom may not be ready yet for very short-lived commands.
  }

  try {
    runtime.logDestination.end();
  } catch {
    // The process can exit safely even if the log destination has already closed.
  }
}
