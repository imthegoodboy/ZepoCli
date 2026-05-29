export function parseJsonFromOutput(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) {
    return undefined;
  }

  const direct = tryParseJson(trimmed);
  if (direct !== undefined) {
    return direct;
  }

  const lines = trimmed.split(/\r?\n/);
  for (let start = lines.length - 1; start >= 0; start -= 1) {
    const candidate = lines.slice(start).join("\n").trim();
    if (!candidate.startsWith("{") && !candidate.startsWith("[")) {
      continue;
    }

    const parsed = tryParseJson(candidate);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}

export function summarizeCommandError(error, stderr) {
  if (error) {
    return {
      code: error.code,
      message: error.message,
      ...(error.hint ? { hint: error.hint } : {}),
      ...(Number.isFinite(error.retryAfterMs) ? { retryAfterMs: error.retryAfterMs } : {})
    };
  }

  return {
    code: "command_failed",
    message: firstLine(stderr) ?? "Command failed."
  };
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function firstLine(value) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
}
