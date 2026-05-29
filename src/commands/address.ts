import chalk from "chalk";
import type { Command } from "commander";

import { printAddress, printAddresses } from "../utils/output.js";
import { joinQuery, wantsJson, withCommandSpinner, withRuntime } from "./shared.js";

export function registerAddressCommand(program: Command): void {
  const address = program.command("address").description("Manage Zepto delivery addresses");

  address
    .command("list")
    .description("List addresses detected from Zepto")
    .option("--json", "print machine-readable JSON")
    .action((options: { json?: boolean }, command: Command) =>
      withRuntime(command, async (runtime) => {
        const { ZeptoService } = await import("../services/zepto.js");
        const json = wantsJson(command, options);
        const service = new ZeptoService(runtime).addresses;
        const addresses = json
          ? await service.list()
          : await withCommandSpinner(
              "Reading Zepto addresses",
              (items) => `Found ${items.length} address${items.length === 1 ? "" : "es"}.`,
              () => service.list()
            );
        printAddresses(addresses, json);
      })
    );

  address
    .command("use")
    .description("Select a saved Zepto address by visible text")
    .argument("<query...>", "address label or text")
    .option("--json", "print machine-readable JSON")
    .action((queryParts: string[], options: { json?: boolean }, command: Command) =>
      withRuntime(command, async (runtime) => {
        const { ZeptoService } = await import("../services/zepto.js");
        const json = wantsJson(command, options);
        const query = joinQuery(queryParts);
        const service = new ZeptoService(runtime).addresses;
        const selected = json
          ? await service.use(query)
          : await withCommandSpinner(`Selecting address "${query}"`, "Address selected.", () => service.use(query));
        if (json) {
          printAddress(selected);
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
        const { ZeptoService } = await import("../services/zepto.js");
        const json = wantsJson(command, options);
        const addresses = await new ZeptoService(runtime).addresses.add();
        if (json) {
          printAddresses(addresses, true);
          return;
        }

        console.log(chalk.green("Address detected from Zepto."));
        printAddresses(addresses);
      })
    );
}
