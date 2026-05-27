#!/usr/bin/env node
import chalk from "chalk";
import { Command } from "commander";
import { ZodError } from "zod";

import { DEFAULT_TIMEOUT_MS } from "./config/constants.js";
import { registerAddCommand } from "./commands/add.js";
import { registerAddressCommand } from "./commands/address.js";
import { registerCartCommands } from "./commands/cart.js";
import { registerCheckoutCommand } from "./commands/checkout.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerLoginCommand } from "./commands/login.js";
import { registerOrderCommands } from "./commands/orders.js";
import { registerSearchCommand } from "./commands/search.js";
import { registerStatusCommand } from "./commands/status.js";
import { isUserFacingError } from "./utils/errors.js";

const program = new Command();

program
  .name("zepo")
  .description("Developer CLI for user-directed Zepto workflows")
  .version("0.1.0")
  .option("--data-dir <path>", "local directory for session, SQLite, and logs")
  .option("--debug", "write verbose automation logs")
  .option("--visible", "run supported browser automation in a visible browser")
  .option("--timeout <ms>", "browser automation timeout", String(DEFAULT_TIMEOUT_MS));

registerLoginCommand(program);
registerStatusCommand(program);
registerDoctorCommand(program);
registerSearchCommand(program);
registerAddCommand(program);
registerCartCommands(program);
registerAddressCommand(program);
registerCheckoutCommand(program);
registerOrderCommands(program);

program.parseAsync(process.argv).catch((error: unknown) => {
  const wantsJson = wantsJsonOutput(process.argv);

  if (isUserFacingError(error)) {
    if (wantsJson) {
      printJsonError({
        type: "user_error",
        message: error.message,
        hint: error.hint,
        exitCode: error.exitCode
      });
      process.exitCode = error.exitCode;
      return;
    }

    console.error(chalk.red(error.message));
    if (error.hint) {
      console.error(chalk.gray(error.hint));
    }
    process.exitCode = error.exitCode;
    return;
  }

  if (error instanceof ZodError) {
    if (wantsJson) {
      printJsonError({
        type: "invalid_input",
        message: "Invalid input.",
        exitCode: 1,
        issues: error.issues.map((issue) => ({
          path: issue.path.join(".") || "value",
          message: issue.message
        }))
      });
      process.exitCode = 1;
      return;
    }

    console.error(chalk.red("Invalid input."));
    for (const issue of error.issues) {
      console.error(chalk.gray(`- ${issue.path.join(".") || "value"}: ${issue.message}`));
    }
    process.exitCode = 1;
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  if (wantsJson) {
    printJsonError({
      type: "unexpected_error",
      message,
      exitCode: 1
    });
    process.exitCode = 1;
    return;
  }

  console.error(chalk.red(message));
  process.exitCode = 1;
});

interface JsonError {
  type: "user_error" | "invalid_input" | "unexpected_error";
  message: string;
  hint?: string;
  exitCode: number;
  issues?: Array<{
    path: string;
    message: string;
  }>;
}

function wantsJsonOutput(argv: string[]): boolean {
  return argv.includes("--json");
}

function printJsonError(error: JsonError): void {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error
      },
      null,
      2
    )
  );
}
