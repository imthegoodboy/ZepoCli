export class UserFacingError extends Error {
  readonly exitCode: number;
  readonly hint?: string;
  readonly code: string;
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    options: { code: string; exitCode?: number; hint?: string; retryAfterMs?: number }
  ) {
    super(message);
    this.name = "UserFacingError";
    this.code = options.code;
    this.exitCode = options.exitCode ?? 1;
    this.hint = options.hint;
    this.retryAfterMs = options.retryAfterMs;
  }
}

export function isUserFacingError(error: unknown): error is UserFacingError {
  return error instanceof UserFacingError;
}

export function requireNonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new UserFacingError(`${label} is required.`, { code: "invalid_input" });
  }
  return trimmed;
}
