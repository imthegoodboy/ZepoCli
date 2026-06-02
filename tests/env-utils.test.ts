import { describe, expect, it } from "vitest";

import { isNpmAuthEnvironmentKey, sanitizedChildEnv } from "../scripts/env-utils.mjs";

describe("verifier child environment sanitizer", () => {
  it("removes npm publish auth variables while preserving runtime environment", () => {
    const env = sanitizedChildEnv(
      {
        APPDATA: "C:\\Users\\parth\\AppData\\Roaming",
        NODE_AUTH_TOKEN: "npm_secret",
        NPM_CONFIG_CACHE: "C:\\npm-cache",
        NPM_CONFIG__AUTH: "secret",
        "NPM_CONFIG_//REGISTRY.NPMJS.ORG/:_AUTHTOKEN": "secret",
        NPM_TOKEN: "npm_secret",
        PATH: "C:\\Windows\\System32"
      },
      {
        FORCE_COLOR: "0",
        NO_COLOR: "1"
      }
    );

    expect(env).toEqual({
      APPDATA: "C:\\Users\\parth\\AppData\\Roaming",
      FORCE_COLOR: "0",
      NO_COLOR: "1",
      NPM_CONFIG_CACHE: "C:\\npm-cache",
      PATH: "C:\\Windows\\System32"
    });
  });

  it("matches npm auth keys without treating ordinary npm config as auth", () => {
    expect(isNpmAuthEnvironmentKey("NPM_TOKEN")).toBe(true);
    expect(isNpmAuthEnvironmentKey("NODE_AUTH_TOKEN")).toBe(true);
    expect(isNpmAuthEnvironmentKey("npm_config__authToken")).toBe(true);
    expect(isNpmAuthEnvironmentKey("npm_config_//registry.npmjs.org/:_authToken")).toBe(true);
    expect(isNpmAuthEnvironmentKey("npm_config_cache")).toBe(false);
    expect(isNpmAuthEnvironmentKey("PATH")).toBe(false);
  });
});
