import type { Command } from "commander";

import { createRuntime, type AppRuntime } from "../config/runtime.js";

export interface GlobalOptions {
  dataDir?: string;
  debug?: boolean;
  visible?: boolean;
  timeout?: string;
}

export async function withRuntime(command: Command, action: (runtime: AppRuntime) => Promise<void> | void): Promise<void> {
  const options = command.optsWithGlobals<GlobalOptions>();
  const runtime = createRuntime({
    dataDir: options.dataDir,
    debug: options.debug ?? false,
    headless: !(options.visible ?? false),
    timeoutMs: options.timeout ? Number.parseInt(options.timeout, 10) : undefined
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
