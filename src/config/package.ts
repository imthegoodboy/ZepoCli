import { readFileSync } from "node:fs";

export function readPackageVersion(packageJsonUrl = new URL("../../package.json", import.meta.url)): string {
  const parsed = JSON.parse(readFileSync(packageJsonUrl, "utf8")) as { version?: unknown };
  if (typeof parsed.version !== "string" || !parsed.version.trim()) {
    throw new Error("package.json must define a non-empty version.");
  }

  return parsed.version;
}

export const PACKAGE_VERSION = readPackageVersion();
