import type { Command } from "commander";
import ora from "ora";
import { z } from "zod";

import { createRuntime, type AppRuntime } from "../config/runtime.js";

export interface GlobalOptions {
  dataDir?: string;
  debug?: boolean;
  input?: boolean;
  visible?: boolean;
  timeout?: string;
}

const RuntimeOptionsSchema = z.object({
  dataDir: z.string().min(1).optional(),
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
  const runtime = createRuntime({
    dataDir: options.dataDir,
    debug: options.debug,
    headless: !options.visible,
    interactive: options.input,
    timeoutMs: options.timeout
  });

  try {
    await action(runtime);
  } finally {
    runtime.sqlite.close();
  }
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
