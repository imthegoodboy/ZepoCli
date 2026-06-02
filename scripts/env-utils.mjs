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
    normalized === "npm_token" ||
    normalized === "node_auth_token" ||
    (normalized.startsWith("npm_config_") && /\b(?:auth|token)\b|_auth|authtoken/.test(normalized))
  );
}
