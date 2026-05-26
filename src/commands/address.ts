import chalk from "chalk";
import ora from "ora";
import type { Command } from "commander";

import { ZeptoService } from "../services/zepto.js";
import { printAddresses } from "../utils/output.js";
import { joinQuery, withRuntime } from "./shared.js";

export function registerAddressCommand(program: Command): void {
  const address = program.command("address").description("Manage Zepto delivery addresses");

  address
    .command("list")
    .description("List addresses detected from Zepto")
    .option("--json", "print machine-readable JSON")
    .action((options: { json?: boolean }, command: Command) =>
      withRuntime(command, async (runtime) => {
        const spinner = options.json ? undefined : ora("Reading Zepto addresses").start();
        const addresses = await new ZeptoService(runtime).addresses.list();
        spinner?.succeed(`Found ${addresses.length} address${addresses.length === 1 ? "" : "es"}.`);
        printAddresses(addresses, options.json);
      })
    );

  address
    .command("use")
    .description("Select a saved Zepto address by visible text")
    .argument("<query...>", "address label or text")
    .action((queryParts: string[], _options: unknown, command: Command) =>
      withRuntime(command, async (runtime) => {
        const query = joinQuery(queryParts);
        const spinner = ora(`Selecting address "${query}"`).start();
        const selected = await new ZeptoService(runtime).addresses.use(query);
        spinner.succeed("Address selected.");
        console.log(chalk.green(selected.text));
      })
    );

  address
    .command("add")
    .description("Open Zepto address flow in the browser")
    .action((_options: unknown, command: Command) =>
      withRuntime(command, async (runtime) => {
        const addresses = await new ZeptoService(runtime).addresses.add();
        console.log(chalk.green("Address flow completed."));
        printAddresses(addresses);
      })
    );
}
