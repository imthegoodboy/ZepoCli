import chalk from "chalk";
import type { Command } from "commander";

import { ZeptoService } from "../services/zepto.js";
import { printAddresses, printJson } from "../utils/output.js";
import { joinQuery, withCommandSpinner, withRuntime } from "./shared.js";

export function registerAddressCommand(program: Command): void {
  const address = program.command("address").description("Manage Zepto delivery addresses");

  address
    .command("list")
    .description("List addresses detected from Zepto")
    .option("--json", "print machine-readable JSON")
    .action((options: { json?: boolean }, command: Command) =>
      withRuntime(command, async (runtime) => {
        const service = new ZeptoService(runtime).addresses;
        const addresses = options.json
          ? await service.list()
          : await withCommandSpinner(
              "Reading Zepto addresses",
              (items) => `Found ${items.length} address${items.length === 1 ? "" : "es"}.`,
              () => service.list()
            );
        printAddresses(addresses, options.json);
      })
    );

  address
    .command("use")
    .description("Select a saved Zepto address by visible text")
    .argument("<query...>", "address label or text")
    .option("--json", "print machine-readable JSON")
    .action((queryParts: string[], options: { json?: boolean }, command: Command) =>
      withRuntime(command, async (runtime) => {
        const query = joinQuery(queryParts);
        const service = new ZeptoService(runtime).addresses;
        const selected = options.json
          ? await service.use(query)
          : await withCommandSpinner(`Selecting address "${query}"`, "Address selected.", () => service.use(query));
        if (options.json) {
          printJson(selected);
          return;
        }

        console.log(chalk.green(selected.text));
      })
    );

  address
    .command("add")
    .description("Open Zepto address flow in the browser")
    .option("--json", "print machine-readable JSON")
    .action((options: { json?: boolean }, command: Command) =>
      withRuntime(command, async (runtime) => {
        const addresses = await new ZeptoService(runtime).addresses.add();
        if (options.json) {
          printAddresses(addresses, true);
          return;
        }

        console.log(chalk.green("Address detected from Zepto."));
        printAddresses(addresses);
      })
    );
}
