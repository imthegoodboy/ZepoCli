import chalk from "chalk";
import type { Command } from "commander";

import { ZeptoService } from "../services/zepto.js";
import { withRuntime } from "./shared.js";

export function registerLoginCommand(program: Command): void {
  program
    .command("login")
    .description("Open Zepto login and save the browser session")
    .option("--phone <number>", "prefill phone number when the login form exposes it")
    .action((options: { phone?: string }, command: Command) =>
      withRuntime(command, async (runtime) => {
        await new ZeptoService(runtime).auth.login(options.phone);
        console.log(chalk.green("Zepto session saved."));
      })
    );

  program
    .command("logout")
    .description("Remove the locally saved Zepto session")
    .action((_options: unknown, command: Command) =>
      withRuntime(command, (runtime) => {
        new ZeptoService(runtime).auth.logout();
        console.log(chalk.green("Local Zepto session removed."));
      })
    );
}
