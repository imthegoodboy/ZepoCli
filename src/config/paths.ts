import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { APP_NAME, BROWSER_PROFILE_DIR, LOG_FILE, SQLITE_FILE, STORAGE_STATE_FILE } from "./constants.js";

export interface AppPaths {
  browserLockPath: string;
  dataDir: string;
  authStatePath: string;
  browserProfileDir: string;
  diagnosticsDir: string;
  dbPath: string;
  logPath: string;
}

export function resolveAppPaths(dataDirOverride?: string): AppPaths {
  const dataDir = dataDirOverride
    ? resolve(expandHome(dataDirOverride))
    : defaultDataDir();

  const paths: AppPaths = {
    browserLockPath: join(dataDir, "browser.lock"),
    dataDir,
    authStatePath: join(dataDir, "storage", STORAGE_STATE_FILE),
    browserProfileDir: join(dataDir, "storage", BROWSER_PROFILE_DIR),
    diagnosticsDir: join(dataDir, "diagnostics"),
    dbPath: join(dataDir, SQLITE_FILE),
    logPath: join(dataDir, LOG_FILE)
  };

  mkdirSync(paths.dataDir, { recursive: true });
  mkdirSync(dirname(paths.authStatePath), { recursive: true });
  mkdirSync(paths.browserProfileDir, { recursive: true });
  mkdirSync(paths.diagnosticsDir, { recursive: true });

  return paths;
}

function defaultDataDir(): string {
  if (process.platform === "win32") {
    return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), APP_NAME);
  }

  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", APP_NAME);
  }

  return join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), APP_NAME);
}

function expandHome(path: string): string {
  if (path === "~") {
    return homedir();
  }

  if (path.startsWith("~/") || path.startsWith("~\\")) {
    return join(homedir(), path.slice(2));
  }

  return path;
}
