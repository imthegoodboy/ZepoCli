import type { Command } from "commander";
import ora from "ora";
import { z } from "zod";

import { closeRuntimeBestEffort, createRuntime, type AppRuntime } from "../config/runtime.js";
import { UserFacingError } from "../utils/errors.js";

export interface GlobalOptions {
  dataDir?: string;
  debug?: boolean;
  json?: boolean;
  input?: boolean;
  visible?: boolean;
  timeout?: string;
}

const RuntimeOptionsSchema = z.object({
  dataDir: z
    .string()
    .refine((value) => value.trim().length > 0, "must not be blank")
    .optional(),
  debug: z.boolean().default(false),
  input: z.boolean().default(true),
  visible: z.boolean().default(false),
  timeout: z
    .string()
    .regex(/^\d+$/, "must be a positive integer number of milliseconds")
    .transform(Number)
    .pipe(z.number().int().min(1_000).max(300_000))
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

  const spinner = ora(startMessage).start();

  try {
    const result = await action();
    spinner.succeed(typeof successMessage === "function" ? successMessage(result) : successMessage);
    return result;
  } catch (error) {
    spinner.fail(startMessage);
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
