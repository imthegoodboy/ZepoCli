#!/usr/bin/env node
import chalk from "chalk";
import { Command } from "commander";
import { ZodError } from "zod";

import { DEFAULT_TIMEOUT_MS } from "./config/constants.js";
import { registerAddCommand } from "./commands/add.js";
import { registerAddressCommand } from "./commands/address.js";
import { registerCartCommands } from "./commands/cart.js";
import { registerCheckoutCommand } from "./commands/checkout.js";
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
registerSearchCommand(program);
registerAddCommand(program);
registerCartCommands(program);
registerAddressCommand(program);
registerCheckoutCommand(program);
registerOrderCommands(program);

program.parseAsync(process.argv).catch((error: unknown) => {
  if (isUserFacingError(error)) {
    console.error(chalk.red(error.message));
    if (error.hint) {
      console.error(chalk.gray(error.hint));
    }
    process.exitCode = error.exitCode;
    return;
  }

  if (error instanceof ZodError) {
    console.error(chalk.red("Invalid input."));
    for (const issue of error.issues) {
      console.error(chalk.gray(`- ${issue.path.join(".") || "value"}: ${issue.message}`));
    }
    process.exitCode = 1;
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error(chalk.red(message));
  process.exitCode = 1;
});
