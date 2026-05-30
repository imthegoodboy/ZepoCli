export function redactSensitiveText(value: string): string {
  return redactSensitivePlainText(redactEncodedSensitiveParameterValues(value));
}

function redactSensitivePlainText(value: string): string {
  return redactRelativeLocalPaths(
    value
      .replace(/\b(Order(?:\s*(?:#|ID:?)?)\s*)[A-Z0-9-]*\d[A-Z0-9-]{3,}\b/gi, "$1<redacted-order-id>")
      .replace(/\bZEP(?=[A-Z0-9-]*\d)[A-Z0-9-]{4,}\b/gi, "<redacted-order-id>")
      .replace(
        /\b((?:otp|one[-\s]?time password|verification(?:\s+code)?|upi\s*pin|atm\s*pin|pin|cvv|cvc)\b(?:\s*(?:is|=|:|-|#)?\s*)?)\d{3,8}\b/gi,
        `$1<redacted-verification-code>`
      )
      .replace(/(?<!\d)(?:\+?91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?!\d)/g, "<redacted-phone>")
      .replace(/\b(?:\d[ -]?){13,19}\b/g, (match) =>
        match.replace(/\D/g, "").length >= 13 ? "<redacted-payment-number>" : match
      )
      .replace(/\b[A-Za-z0-9._%+-]{2,}@[A-Za-z][A-Za-z0-9.-]{1,}\b/g, "<redacted-payment-handle>")
      .replace(/\b[A-Za-z]:\\[^\r\n"'<>|]*/g, redactLocalPathMatch)
      .replace(/\/(?:Users|home|tmp|var|private|workspace|mnt|opt|root)\/[^\r\n"'<>]*/g, redactLocalPathMatch)
  );
}

function redactEncodedSensitiveParameterValues(value: string): string {
  return value.replace(
    /\b((?:phone|mobile|tel|otp|pin|cvv|cvc|card|payment|upi|auth|session|token|jwt|access[-_]?token|refresh[-_]?token|id[-_]?token|path|file|data[-_]?dir|report(?:[-_]?path)?)\s*(?:=|%3[Dd]))([^&\s"'<>]+)/gi,
    (match, prefix: string, encodedValue: string) => {
      const decoded = decodeQueryValue(encodedValue);
      if (!decoded) {
        return match;
      }

      if (/(?:auth|session|token|jwt)/i.test(prefix)) {
        return `${prefix}<redacted-auth-token>`;
      }

      const redacted = redactSensitivePlainText(decoded);
      if (
        redacted === decoded &&
        /(?:otp|pin|cvv|cvc)/i.test(prefix) &&
        /^\d{3,8}$/.test(decoded.trim())
      ) {
        return `${prefix}<redacted-verification-code>`;
      }

      return redacted === decoded ? match : `${prefix}${redacted}`;
    }
  );
}

function decodeQueryValue(value: string): string | undefined {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return undefined;
  }
}

export function redactSensitiveValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redactSensitiveText(value);
  }

  if (value instanceof Error) {
    return redactSensitiveError(value);
  }

  if (Array.isArray(value)) {
    return value.map(redactSensitiveValue);
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, redactSensitiveValue(child)]));
}

function redactSensitiveError(error: Error): Error {
  const cause = "cause" in error ? redactSensitiveValue((error as Error & { cause?: unknown }).cause) : undefined;
  const redacted =
    cause === undefined
      ? new Error(redactSensitiveText(error.message))
      : new Error(redactSensitiveText(error.message), { cause });

  redacted.name = redactSensitiveText(error.name);
  if (error.stack) {
    redacted.stack = redactSensitiveText(error.stack);
  }

  for (const [key, child] of Object.entries(error)) {
    (redacted as Error & Record<string, unknown>)[key] = redactSensitiveValue(child);
  }

  return redacted;
}

function redactRelativeLocalPaths(value: string): string {
  return value.replace(/(^|[\s("'`])((?:\.{1,2}|\.zepo-live)[\\/][^\r\n"'<>]*)/g, (_match, prefix: string, path: string) => {
    return `${prefix}${redactLocalPathMatch(path)}`;
  });
}

function redactLocalPathMatch(value: string): string {
  const connector = value.match(/\s+(?:and|or|with|after|before|near)\s+/i);
  if (connector?.index !== undefined) {
    return `${redactLocalPathMatch(value.slice(0, connector.index))}${value.slice(connector.index)}`;
  }

  const punctuation = value.match(/[.,;:!?)]$/)?.[0] ?? "";
  return `<redacted-local-path>${punctuation}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
