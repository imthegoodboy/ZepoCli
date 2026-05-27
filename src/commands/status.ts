import chalk from "chalk";
import type { Command } from "commander";

import type { SessionStatus } from "../types.js";
import { printJson } from "../utils/output.js";
import { withRuntime } from "./shared.js";

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Show local ZepoCli session and storage status")
    .option("--json", "print machine-readable JSON")
    .action((options: { json?: boolean }, command: Command) =>
      withRuntime(command, (runtime) => {
        const status = runtime.session.status();
        if (options.json) {
          printJson(status);
          return;
        }

        printStatus(status);
      })
    );
}

function printStatus(status: SessionStatus): void {
  const auth = status.hasAuthState ? chalk.green("present") : chalk.yellow("missing");
  const profile = status.hasBrowserProfileData ? chalk.green("present") : chalk.yellow("empty");
  const loginMarker = status.markedLoggedIn ? chalk.green("yes") : chalk.yellow("no");
  const confirmedSession = status.confirmedSession ? chalk.green("yes") : chalk.yellow("no");

  console.log(`${chalk.bold("Auth state:")} ${auth}`);
  console.log(`${chalk.bold("Browser profile:")} ${profile}`);
  console.log(`${chalk.bold("Marked logged in:")} ${loginMarker}`);
  console.log(`${chalk.bold("Confirmed session:")} ${confirmedSession}`);

  if (status.updatedAt) {
    console.log(`${chalk.bold("Last session update:")} ${status.updatedAt}`);
  }

  console.log(`${chalk.bold("Data dir:")} ${status.dataDir}`);
  console.log(`${chalk.bold("Diagnostics:")} ${status.diagnosticsDir}`);
}
