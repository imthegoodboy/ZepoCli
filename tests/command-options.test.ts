import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Command } from "commander";
import { describe, expect, it } from "vitest";

import { registerAddCommand } from "../src/commands/add.js";
import { registerAddressCommand } from "../src/commands/address.js";
import { registerCartCommands } from "../src/commands/cart.js";
import { registerCheckoutCommand } from "../src/commands/checkout.js";
import { registerDoctorCommand } from "../src/commands/doctor.js";
import { registerLoginCommand } from "../src/commands/login.js";
import { registerOrderCommands } from "../src/commands/orders.js";
import { registerPaymentCommand } from "../src/commands/payment.js";
import { registerSearchCommand } from "../src/commands/search.js";
import { registerStatusCommand } from "../src/commands/status.js";

describe("command options", () => {
  it("keeps machine-readable output available on agent-facing actions", () => {
    const program = new Command();
    registerLoginCommand(program);
    registerStatusCommand(program);
    registerDoctorCommand(program);
    registerSearchCommand(program);
    registerAddCommand(program);
    registerCartCommands(program);
    registerPaymentCommand(program);
    registerAddressCommand(program);
    registerCheckoutCommand(program);
    registerOrderCommands(program);

    for (const commandPath of [
      ["login"],
      ["logout"],
      ["status"],
      ["doctor"],
      ["search"],
      ["add"],
      ["cart"],
      ["payment"],
      ["remove"],
      ["clear"],
      ["address", "list"],
      ["address", "use"],
      ["address", "add"],
      ["checkout"],
      ["track"],
      ["history"],
      ["reorder"]
    ]) {
      const command = findCommand(program, commandPath);
      expect(command.options.some((option) => option.long === "--json")).toBe(true);
    }
  });

  it("keeps service imports lazy so help and version stay fast", () => {
    for (const file of [
      "login.ts",
      "status.ts",
      "doctor.ts",
      "search.ts",
      "add.ts",
      "cart.ts",
      "payment.ts",
      "address.ts",
      "checkout.ts",
      "orders.ts",
      "completion.ts"
    ]) {
      const source = readFileSync(resolve(import.meta.dirname, "..", "src", "commands", file), "utf8");
      expect(source, `${file} should not load service/browser code before command actions run`).not.toMatch(
        /^\s*import\s+.*\s+from\s+["']\.\.\/services\//m
      );
    }
  });

  it("exposes safe checkout-link QR options from cart without requiring checkout", () => {
    const program = new Command();
    registerCartCommands(program);

    const cart = findCommand(program, ["cart"]);
    expect(cart.options.some((option) => option.long === "--qr")).toBe(true);
    expect(cart.options.some((option) => option.long === "--qr-file")).toBe(true);
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
