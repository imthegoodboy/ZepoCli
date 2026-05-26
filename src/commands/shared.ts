import type { Command } from "commander";
import { z } from "zod";

import { createRuntime, type AppRuntime } from "../config/runtime.js";

export interface GlobalOptions {
  dataDir?: string;
  debug?: boolean;
  visible?: boolean;
  timeout?: string;
}

const RuntimeOptionsSchema = z.object({
  dataDir: z.string().min(1).optional(),
  debug: z.boolean().default(false),
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
    timeoutMs: options.timeout
  });

  try {
    await action(runtime);
  } finally {
    runtime.sqlite.close();
  }
}

export function joinQuery(parts: string[]): string {
  return parts.join(" ").trim();
}
