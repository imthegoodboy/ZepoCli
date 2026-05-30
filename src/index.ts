#!/usr/bin/env node
import chalk from "chalk";
import { Command, CommanderError } from "commander";
import { ZodError } from "zod";

import { DEFAULT_TIMEOUT_MS } from "./config/constants.js";
import { PACKAGE_VERSION } from "./config/package.js";
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
import { printJsonError } from "./utils/output.js";
import { redactSensitiveText } from "./utils/redaction.js";

const program = new Command();

program
  .name("zepo")
  .description("Developer CLI for user-directed Zepto workflows")
  .version(PACKAGE_VERSION)
  .option("--data-dir <path>", "local directory for session, SQLite, and logs")
  .option("--debug", "write verbose automation logs")
  .option("--json", "print machine-readable JSON when supported")
  .option("--no-input", "fail instead of prompting for interactive input")
  .option("--visible", "run supported browser automation in a visible browser")
  .option("--timeout <ms>", "browser automation timeout", String(DEFAULT_TIMEOUT_MS));

program.exitOverride();
program.configureOutput({
  writeErr: () => undefined
});

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

  if (error instanceof CommanderError) {
    if (error.exitCode === 0) {
      process.exitCode = 0;
      return;
    }

    if (wantsJson) {
      printJsonError({
        type: "invalid_input",
        code: "invalid_input",
        message: error.message,
        exitCode: error.exitCode
      });
      process.exitCode = error.exitCode;
      return;
    }

    console.error(chalk.red(redactSensitiveText(error.message)));
    process.exitCode = error.exitCode;
    return;
  }

  if (isUserFacingError(error)) {
    if (wantsJson) {
      printJsonError({
        type: "user_error",
        code: error.code,
        message: error.message,
        hint: error.hint,
        exitCode: error.exitCode,
        retryAfterMs: error.retryAfterMs
      });
      process.exitCode = error.exitCode;
      return;
    }

    console.error(chalk.red(redactSensitiveText(error.message)));
    if (error.hint) {
      console.error(chalk.gray(redactSensitiveText(error.hint)));
    }
    process.exitCode = error.exitCode;
    return;
  }

  if (error instanceof ZodError) {
    if (wantsJson) {
      printJsonError({
        type: "invalid_input",
        code: "invalid_input",
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
      console.error(chalk.gray(redactSensitiveText(`- ${issue.path.join(".") || "value"}: ${issue.message}`)));
    }
    process.exitCode = 1;
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  if (wantsJson) {
    printJsonError({
      type: "unexpected_error",
      code: "unexpected_error",
      message,
      exitCode: 1
    });
    process.exitCode = 1;
    return;
  }

  console.error(chalk.red(redactSensitiveText(message)));
  process.exitCode = 1;
});

function wantsJsonOutput(argv: string[]): boolean {
  return argv.includes("--json");
}
