export function parseDecimalInteger(input: unknown): number | undefined {
  if (typeof input === "number") {
    return Number.isInteger(input) ? input : undefined;
  }

  if (typeof input !== "string") {
    return undefined;
  }

  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed)) {
    return undefined;
  }

  return Number(trimmed);
}
