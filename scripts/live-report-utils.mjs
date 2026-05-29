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

export function summarizeCommandError(error, stderr, args = []) {
  const redactions = liveReportTextRedactions(args);

  if (error) {
    return {
      code: error.code,
      message: redactText(error.message, redactions),
      ...(error.hint ? { hint: redactText(error.hint, redactions) } : {}),
      ...(Number.isFinite(error.retryAfterMs) ? { retryAfterMs: error.retryAfterMs } : {})
    };
  }

  return {
    code: "command_failed",
    message: redactText(firstLine(stderr) ?? "Command failed.", redactions)
  };
}

export function redactArgsForLiveConsole(args) {
  return redactOptionValues(args, new Map([["--phone", "<redacted-phone>"]]));
}

export function redactArgsForLiveReport(args) {
  const redacted = redactOptionValues(
    args,
    new Map([
      ["--data-dir", "<redacted-data-dir>"],
      ["--phone", "<redacted-phone>"],
      ["--report", "<redacted-report-path>"]
    ])
  );
  const positionals = collectPositionals(redacted);
  const command = positionals[0]?.value;

  if (command === "search" || command === "add") {
    redactPositional(redacted, positionals[1], "<redacted-query>");
  } else if (command === "address" && positionals[1]?.value === "use") {
    redactPositional(redacted, positionals[2], "<redacted-address-query>");
  }

  return redacted;
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

function redactOptionValues(args, redactions) {
  const result = [...args];
  for (let index = 0; index < result.length; index += 1) {
    const replacement = redactions.get(result[index]);
    if (replacement !== undefined && index + 1 < result.length) {
      result[index + 1] = replacement;
      index += 1;
    }
  }

  return result;
}

function liveReportTextRedactions(args) {
  const redactions = [];
  collectOptionValueRedactions(args, redactions, {
    "--data-dir": "<redacted-data-dir>",
    "--phone": "<redacted-phone>",
    "--report": "<redacted-report-path>"
  });

  const positionals = collectPositionals(args);
  const command = positionals[0]?.value;
  if (command === "search" || command === "add") {
    addRedaction(redactions, positionals[1]?.value, "<redacted-query>");
  } else if (command === "address" && positionals[1]?.value === "use") {
    addRedaction(redactions, positionals[2]?.value, "<redacted-address-query>");
  }

  return redactions.sort((left, right) => right.value.length - left.value.length);
}

function collectOptionValueRedactions(args, redactions, replacements) {
  for (let index = 0; index < args.length; index += 1) {
    const replacement = replacements[args[index]];
    if (replacement !== undefined) {
      addRedaction(redactions, args[index + 1], replacement);
      index += 1;
    }
  }
}

function addRedaction(redactions, value, replacement) {
  if (!value || String(value).trim().length === 0 || String(value).startsWith("<redacted-")) {
    return;
  }

  if (redactions.some((redaction) => redaction.value === value)) {
    return;
  }

  redactions.push({
    value: String(value),
    replacement
  });
}

function redactText(value, redactions) {
  let redacted = String(value ?? "");
  for (const redaction of redactions) {
    redacted = redacted.split(redaction.value).join(redaction.replacement);
  }

  return redacted;
}

function collectPositionals(args) {
  const valueOptions = new Set(["--data-dir", "--phone", "--quantity", "--report"]);
  const positionals = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (valueOptions.has(arg)) {
      index += 1;
      continue;
    }

    if (arg.startsWith("-")) {
      continue;
    }

    positionals.push({
      index,
      value: arg
    });
  }

  return positionals;
}

function redactPositional(args, positional, replacement) {
  if (positional) {
    args[positional.index] = replacement;
  }
}
