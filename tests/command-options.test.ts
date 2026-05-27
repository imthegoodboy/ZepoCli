import { Command } from "commander";
import { describe, expect, it } from "vitest";

import { registerAddCommand } from "../src/commands/add.js";
import { registerAddressCommand } from "../src/commands/address.js";
import { registerCartCommands } from "../src/commands/cart.js";
import { registerCheckoutCommand } from "../src/commands/checkout.js";
import { registerLoginCommand } from "../src/commands/login.js";
import { registerOrderCommands } from "../src/commands/orders.js";

describe("command options", () => {
  it("keeps machine-readable output available on agent-facing actions", () => {
    const program = new Command();
    registerLoginCommand(program);
    registerAddCommand(program);
    registerCartCommands(program);
    registerAddressCommand(program);
    registerCheckoutCommand(program);
    registerOrderCommands(program);

    for (const commandPath of [
      ["login"],
      ["logout"],
      ["add"],
      ["remove"],
      ["clear"],
      ["address", "use"],
      ["address", "add"],
      ["checkout"],
      ["reorder"]
    ]) {
      const command = findCommand(program, commandPath);
      expect(command.options.some((option) => option.long === "--json")).toBe(true);
    }
  });
});

function findCommand(program: Command, path: string[]): Command {
  let current = program;
  for (const name of path) {
    const child = current.commands.find((command) => command.name() === name);
    if (!child) {
      throw new Error(`Missing command: ${path.join(" ")}`);
    }
    current = child;
  }

  return current;
}
