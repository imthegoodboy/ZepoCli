import chalk from "chalk";
import type { Command } from "commander";

import { ZeptoService } from "../services/zepto.js";
import { printJson } from "../utils/output.js";
import { withRuntime } from "./shared.js";

export function registerLoginCommand(program: Command): void {
  program
    .command("login")
    .description("Open Zepto login and save the browser session")
    .option("--phone <number>", "prefill phone number when the login form exposes it")
    .option("--json", "print machine-readable JSON")
    .action((options: { phone?: string; json?: boolean }, command: Command) =>
      withRuntime(command, async (runtime) => {
        await new ZeptoService(runtime).auth.login(options.phone);
        if (options.json) {
          printJson({ sessionSaved: true });
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
      withRuntime(command, (runtime) => {
        new ZeptoService(runtime).auth.logout();
        if (options.json) {
          printJson({ sessionRemoved: true });
          return;
        }

        console.log(chalk.green("Local Zepto session removed."));
      })
    );
}
