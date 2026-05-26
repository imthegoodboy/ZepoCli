export class UserFacingError extends Error {
  readonly exitCode: number;
  readonly hint?: string;

  constructor(message: string, options: { exitCode?: number; hint?: string } = {}) {
    super(message);
    this.name = "UserFacingError";
    this.exitCode = options.exitCode ?? 1;
    this.hint = options.hint;
  }
}

export function isUserFacingError(error: unknown): error is UserFacingError {
  return error instanceof UserFacingError;
}

export function requireNonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new UserFacingError(`${label} is required.`);
  }
  return trimmed;
}
