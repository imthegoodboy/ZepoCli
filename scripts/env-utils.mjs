export function sanitizedChildEnv(sourceEnv = process.env, overrides = {}) {
  const env = {
    ...sourceEnv,
    ...overrides
  };

  for (const key of Object.keys(env)) {
    if (isNpmAuthEnvironmentKey(key)) {
      delete env[key];
    }
  }

  return env;
}

export function isNpmAuthEnvironmentKey(key) {
  const normalized = String(key ?? "").toLowerCase();
  return (
    packageManagerAuthEnvironmentKeys.has(normalized) ||
    (normalized.startsWith("npm_config_") && /\b(?:auth|token)\b|_auth|authtoken/.test(normalized))
  );
}

const packageManagerAuthEnvironmentKeys = new Set([
  "corepack_npm_token",
  "node_auth_token",
  "npm_auth_ident",
  "npm_auth_token",
  "npm_token",
  "yarn_npm_auth",
  "yarn_npm_auth_ident",
  "yarn_npm_auth_token"
]);
