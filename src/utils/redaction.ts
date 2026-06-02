export function redactSensitiveText(value: string): string {
  return redactSensitivePlainText(redactEncodedSensitiveParameterValues(redactEncodedSensitiveFragments(value)));
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
      .replace(/\bnpm_[A-Za-z0-9]{20,}\b/g, "<redacted-npm-token>")
      .replace(/\b\d(?:[ -]?\d){12,18}\b/g, (match) =>
        match.replace(/\D/g, "").length >= 13 ? "<redacted-payment-number>" : match
      )
      .replace(/\b[A-Za-z0-9._%+-]{2,}@[A-Za-z][A-Za-z0-9.-]{1,}\b/g, "<redacted-payment-handle>")
      .replace(/file:\/\/\/[A-Za-z]:[\\/](?![\\/])[^\r\n"',;<>|]*/gi, redactLocalPathMatch)
      .replace(/(?<![A-Za-z])[A-Za-z]:[\\/](?![\\/])[^\r\n"',;<>|]*/g, redactLocalPathMatch)
      .replace(/\/(?:Users|home|tmp|var|private|workspace|mnt|opt|root)\/[^\r\n"',;<>|]*/g, redactLocalPathMatch)
  );
}

function redactEncodedSensitiveParameterValues(value: string): string {
  return value.replace(
    /\b((?:phone|mobile|tel|otp|pin|cvv|cvc|card|payment|upi|auth|session|password|passwd|passphrase|pwd|secret|credential|token|jwt|access[-_]?token|refresh[-_]?token|id[-_]?token|path|file|data[-_]?dir|report(?:[-_]?path)?)\s*(?:=|%3[Dd]))([^&\s"'<>]+)/gi,
    (match, prefix: string, encodedValue: string) => {
      const decoded = decodeQueryValue(encodedValue);
      if (!decoded) {
        return match;
      }

      if (/(?:auth|session|password|passwd|passphrase|pwd|secret|credential|token|jwt)/i.test(prefix)) {
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

function redactEncodedSensitiveFragments(value: string): string {
  return value.replace(/[^\s"',;<>]*%[0-9A-Fa-f]{2}[^\s"',;<>]*/g, (match) => {
    const decoded = decodeQueryValue(match);
    if (!decoded || decoded === match) {
      return match;
    }

    const redacted = redactSensitivePlainText(redactEncodedSensitiveParameterValues(decoded));
    return redacted === decoded ? match : redacted;
  });
}

function decodeQueryValue(value: string): string | undefined {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return undefined;
  }
}

export function redactSensitiveValue(value: unknown): unknown {
  return redactSensitiveValueInternal(value, new WeakSet<object>());
}

export function redactedStructuredValueForKey(key: string, value: unknown): string | undefined {
  const normalizedKey = normalizeStructuredKey(key);
  const placeholder = sensitiveValuePlaceholderForKey(key);
  if (!placeholder || !hasRedactableStructuredValue(value)) {
    return undefined;
  }

  if (isPathLikeStructuredKey(normalizedKey) && typeof value === "string" && redactSensitiveText(value) !== value) {
    return undefined;
  }

  return placeholder;
}

function redactSensitiveValueInternal(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === "string") {
    return redactSensitiveText(value);
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Error) {
    return redactSensitiveError(value, seen);
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return "[Circular]";
    }

    seen.add(value);
    try {
      return value.map((child) => redactSensitiveValueInternal(child, seen));
    } finally {
      seen.delete(value);
    }
  }

  if (!isPlainObject(value)) {
    return value;
  }

  if (seen.has(value)) {
    return "[Circular]";
  }

  seen.add(value);
  try {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => {
        const structuredRedaction = redactedStructuredValueForKey(key, child);
        return [
          redactSensitiveText(key),
          structuredRedaction ?? redactSensitiveValueInternal(child, seen)
        ];
      })
    );
  } finally {
    seen.delete(value);
  }
}

function redactSensitiveError(error: Error, seen: WeakSet<object>): Error | string {
  if (seen.has(error)) {
    return "[Circular]";
  }

  seen.add(error);
  try {
    const cause =
      "cause" in error ? redactSensitiveValueInternal((error as Error & { cause?: unknown }).cause, seen) : undefined;
    const redacted =
      cause === undefined
        ? new Error(redactSensitiveText(error.message))
        : new Error(redactSensitiveText(error.message), { cause });

    redacted.name = redactSensitiveText(error.name);
    if (error.stack) {
      redacted.stack = redactSensitiveText(error.stack);
    }

    for (const [key, child] of Object.entries(error)) {
      const structuredRedaction = redactedStructuredValueForKey(key, child);
      (redacted as Error & Record<string, unknown>)[redactSensitiveText(key)] =
        structuredRedaction ?? redactSensitiveValueInternal(child, seen);
    }

    return redacted;
  } finally {
    seen.delete(error);
  }
}

function redactRelativeLocalPaths(value: string): string {
  return value.replace(
    /(^|[\s("'`])((?:\.{1,2}[\\/][^\r\n"',;<>|]*)|(?:\.zepo(?:-[A-Za-z0-9._-]+)?(?:[\\/][^\r\n"',;<>|]*)?))/g,
    (_match, prefix: string, path: string) => {
      return `${prefix}${redactLocalPathMatch(path)}`;
    }
  );
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

function sensitiveValuePlaceholderForKey(key: string): string | undefined {
  const normalized = normalizeStructuredKey(key);
  if (!normalized) {
    return undefined;
  }

  if (/\b(phone|mobile|telephone|tel)\b/i.test(normalized)) {
    return "<redacted-phone>";
  }

  if (/\b(otp|one time password|verification code|cvv|cvc|upi pin|atm pin|passcode)\b/i.test(normalized)) {
    return "<redacted-verification-code>";
  }

  if (/\b(upi|payment handle)\b/i.test(normalized)) {
    return "<redacted-payment-handle>";
  }

  if (/\b(card|credit card|debit card|payment number)\b/i.test(normalized)) {
    return "<redacted-payment-number>";
  }

  if (
    /\b(authorization|proxy authorization|cookie|set cookie|auth|session|token|jwt|password|passwd|passphrase|pwd|secret|credential|api key|apikey|client secret|access token|refresh token|id token)\b/i.test(
      normalized
    )
  ) {
    return "<redacted-auth-token>";
  }

  return undefined;
}

function hasRedactableStructuredValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  return typeof value !== "string" || value.trim().length > 0;
}

function normalizeStructuredKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isPathLikeStructuredKey(normalizedKey: string): boolean {
  return /\b(path|dir|directory|file|folder)\b/i.test(normalizedKey);
}
