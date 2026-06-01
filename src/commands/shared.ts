import type { Command } from "commander";
import ora from "ora";
import { z } from "zod";

import { closeRuntimeBestEffort, createRuntime, type AppRuntime } from "../config/runtime.js";
import { UserFacingError } from "../utils/errors.js";
import { redactSensitiveText } from "../utils/redaction.js";

export interface GlobalOptions {
  browserLocale?: string;
  browserTimezone?: string;
  dataDir?: string;
  debug?: boolean;
  json?: boolean;
  input?: boolean;
  visible?: boolean;
  timeout?: string;
}

const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 300_000;

const BrowserLocaleSchema = z
  .string()
  .trim()
  .min(1, "must not be blank")
  .refine(isValidBrowserLocale, "must be a valid BCP 47 locale")
  .transform((value) => Intl.getCanonicalLocales(value)[0])
  .optional();

const BrowserTimezoneSchema = z
  .string()
  .trim()
  .min(1, "must not be blank")
  .refine(isValidBrowserTimezone, "must be a valid IANA time zone")
  .transform(normalizeBrowserTimezone)
  .optional();

const RuntimeOptionsSchema = z.object({
  browserLocale: BrowserLocaleSchema,
  browserTimezone: BrowserTimezoneSchema,
  dataDir: z
    .string()
    .refine((value) => value.trim().length > 0, "must not be blank")
    .optional(),
  debug: z.boolean().default(false),
  input: z.boolean().default(true),
  visible: z.boolean().default(false),
  timeout: z
    .string()
    .regex(/^\d+$/, "must be a decimal integer number of milliseconds")
    .transform(Number)
    .pipe(
      z
        .number()
        .int()
        .min(MIN_TIMEOUT_MS, `must be at least ${MIN_TIMEOUT_MS} ms`)
        .max(MAX_TIMEOUT_MS, `must be at most ${MAX_TIMEOUT_MS} ms`)
    )
    .optional()
});

export function parseRuntimeOptions(options: GlobalOptions) {
  return RuntimeOptionsSchema.parse(options);
}

export async function withRuntime(command: Command, action: (runtime: AppRuntime) => Promise<void> | void): Promise<void> {
  const options = parseRuntimeOptions(command.optsWithGlobals<GlobalOptions>());
  const runtime = createRuntimeOrThrow(options);

  try {
    await action(runtime);
  } finally {
    closeRuntimeBestEffort(runtime);
  }
}

export function createRuntimeOrThrow(options: ReturnType<typeof parseRuntimeOptions>): AppRuntime {
  try {
    return createRuntime({
      browserLocale: options.browserLocale,
      browserTimezone: options.browserTimezone,
      dataDir: options.dataDir,
      debug: options.debug,
      headless: !options.visible,
      interactive: options.input,
      timeoutMs: options.timeout
    });
  } catch (error) {
    throw toRuntimeSetupError(error, options.dataDir);
  }
}

export function toRuntimeSetupError(error: unknown, dataDir?: string): UserFacingError {
  const detail = firstErrorLine(error);
  const location = dataDir ? ` at ${dataDir}` : "";
  const detailText = detail ? ` Details: ${detail}` : "";

  return new UserFacingError(`Could not initialize local ZepoCli storage${location}.`, {
    code: "runtime_setup_failed",
    hint: `Choose a writable directory with \`zepo --data-dir <path> doctor\`, or remove/rename any file currently using that path.${detailText}`
  });
}

export async function withCommandSpinner<T>(
  startMessage: string,
  successMessage: string | ((result: T) => string),
  action: () => Promise<T>
): Promise<T> {
  if (!process.stderr.isTTY) {
    return action();
  }

  const safeStartMessage = redactSensitiveText(startMessage);
  const spinner = ora(safeStartMessage).start();

  try {
    const result = await action();
    const message = typeof successMessage === "function" ? successMessage(result) : successMessage;
    spinner.succeed(redactSensitiveText(message));
    return result;
  } catch (error) {
    spinner.fail(safeStartMessage);
    throw error;
  }
}

export function joinQuery(parts: string[]): string {
  return parts.join(" ").trim();
}

export function wantsJson(command: Command, options: { json?: boolean }): boolean {
  return options.json === true || command.optsWithGlobals<GlobalOptions>().json === true;
}

function firstErrorLine(error: unknown): string | undefined {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
}

function isValidBrowserLocale(value: string): boolean {
  try {
    return Intl.getCanonicalLocales(value).length > 0;
  } catch {
    return false;
  }
}

function isValidBrowserTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

function normalizeBrowserTimezone(value: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone;
}
