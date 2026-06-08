#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { sanitizedChildEnv } from "./env-utils.mjs";

const rootDir = resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf8"));
const packageSpec = `${packageJson.name}@${packageJson.version}`;
const commandEnv = sanitizedChildEnv(process.env, {
  FORCE_COLOR: "0",
  NO_COLOR: "1"
});

if (!packageJson.name || !packageJson.version) {
  throw new Error("package.json must define name and version before publish dry-run verification");
}

if (process.env.ZEPO_FORCE_PUBLISH_DRY_RUN !== "1" && isExactVersionPublished(packageSpec)) {
  console.log(`skip publish dry-run: ${packageSpec} is already published on npm`);
  process.exit(0);
}

const result = runNpm(["publish", "--dry-run", "--access", "public"], { stdio: "inherit" });
process.exit(result.status ?? 1);

function isExactVersionPublished(spec) {
  const result = runNpm(["view", spec, "version", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (result.status !== 0) {
    return false;
  }

  const publishedVersion = parseJsonString(result.stdout);
  return publishedVersion === packageJson.version;
}

function parseJsonString(value) {
  try {
    const parsed = JSON.parse(String(value ?? "").trim());
    return typeof parsed === "string" ? parsed : "";
  } catch {
    return String(value ?? "").trim();
  }
}

function runNpm(args, options = {}) {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath) {
    return spawnSync(process.execPath, [npmExecPath, ...args], {
      cwd: rootDir,
      env: commandEnv,
      ...options
    });
  }

  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  return spawnSync(command, args, {
    cwd: rootDir,
    env: commandEnv,
    ...options
  });
}
