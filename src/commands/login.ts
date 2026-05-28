import chalk from "chalk";
import type { Command } from "commander";

import { printJson } from "../utils/output.js";
import { wantsJson, withRuntime } from "./shared.js";

export function registerLoginCommand(program: Command): void {
  program
    .command("login")
    .description("Open Zepto login and save the browser session")
    .option("--phone <number>", "prefill phone number when the login form exposes it")
    .option("--json", "print machine-readable JSON")
    .action((options: { phone?: string; json?: boolean }, command: Command) =>
      withRuntime(command, async (runtime) => {
        const { ZeptoService } = await import("../services/zepto.js");
        const json = wantsJson(command, options);
        await new ZeptoService(runtime).auth.login(options.phone);
        if (json) {
          printJson(loginOutput());
          return;
        }

        console.log(chalk.green("Zepto session saved."));
      })
    );

  program
    .command("logout")
    .description("Remove the locally saved Zepto session")
    .option("--json", "print machine-readable JSON")
    .action((options: { json?: boolean }, command: Command) =>
      withRuntime(command, async (runtime) => {
        const { ZeptoService } = await import("../services/zepto.js");
        const json = wantsJson(command, options);
        new ZeptoService(runtime).auth.logout();
        if (json) {
          printJson(logoutOutput());
          return;
        }

        console.log(chalk.green("Local Zepto session removed."));
      })
    );
}

export interface LoginOutput {
  status: "session_saved";
  sessionSaved: true;
  confirmedSession: true;
  next: string;
}

export function loginOutput(): LoginOutput {
  return {
    status: "session_saved",
    sessionSaved: true,
    confirmedSession: true,
    next: "Run `zepo status --live --json` before account-dependent commands."
  };
}

export interface LogoutOutput {
  status: "session_removed";
  sessionRemoved: true;
  cacheCleared: true;
  next: string;
}

export function logoutOutput(): LogoutOutput {
  return {
    status: "session_removed",
    sessionRemoved: true,
    cacheCleared: true,
    next: "Run `zepo login` before account-dependent commands."
  };
}
