import { Command } from "commander";
import { describe, expect, it } from "vitest";

import { registerAddCommand } from "../src/commands/add.js";
import { registerAddressCommand } from "../src/commands/address.js";
import { registerCartCommands } from "../src/commands/cart.js";
import { registerCheckoutCommand } from "../src/commands/checkout.js";
import {
  buildCompletionSpec,
  parseCompletionShell,
  registerCompletionCommand,
  renderCompletionScript
} from "../src/commands/completion.js";
import { registerDoctorCommand } from "../src/commands/doctor.js";
import { registerLoginCommand } from "../src/commands/login.js";
import { registerOrderCommands } from "../src/commands/orders.js";
import { registerPaymentCommand } from "../src/commands/payment.js";
import { registerSearchCommand } from "../src/commands/search.js";
import { registerStatusCommand } from "../src/commands/status.js";
import { UserFacingError } from "../src/utils/errors.js";

describe("shell completion", () => {
  it("generates completion candidates from the registered command tree", () => {
    const program = createProgram();
    const spec = buildCompletionSpec(program);

    expect(spec.commandName).toBe("zepo");
    expect(spec.commands.find((command) => command.path.length === 0)?.subcommands).toEqual([
      "login",
      "logout",
      "status",
      "doctor",
      "search",
      "add",
      "cart",
      "remove",
      "clear",
      "payment",
      "address",
      "checkout",
      "track",
      "history",
      "reorder",
      "completion",
      "help"
    ]);
    expect(spec.commands.find((command) => command.path.join(" ") === "help")?.subcommands).toContain("search");
    expect(spec.commands.find((command) => command.path.join(" ") === "help address")?.subcommands).toEqual([
      "list",
      "use",
      "add"
    ]);
    expect(spec.commands.find((command) => command.path.join(" ") === "address")?.subcommands).toEqual([
      "list",
      "use",
      "add"
    ]);
    expect(spec.globalOptions.flatMap((option) => option.flags)).toContain("--visible");
    expect(spec.commands.find((command) => command.path.join(" ") === "search")?.options[0]?.flags).toContain("-l");
  });

  it("renders shell scripts without touching runtime or browser services", () => {
    const spec = buildCompletionSpec(createProgram());

    const bash = renderCompletionScript("bash", spec);
    const zsh = renderCompletionScript("zsh", spec);
    const fish = renderCompletionScript("fish", spec);
    const powershell = renderCompletionScript("powershell", spec);

    expect(bash).toContain("complete -F _zepo_completion zepo");
    expect(bash).toContain("address\\ list");
    expect(bash).toContain("help) candidates='login logout status doctor search add cart remove clear payment");
    expect(bash).toContain("help\\ address) candidates='list use add");
    expect(bash).toContain("-h --help");
    expect(bash).toContain("--data-dir --debug --json --no-input --visible");
    expect(zsh).toContain("#compdef zepo");
    expect(fish).toContain("complete -c zepo -f");
    expect(fish).toContain("__fish_seen_subcommand_from address");
    expect(powershell).toContain("Register-ArgumentCompleter -Native -CommandName 'zepo'");
    expect(`${bash}\n${zsh}\n${fish}\n${powershell}`).not.toContain("ZeptoService");
    expect(`${bash}\n${zsh}\n${fish}\n${powershell}`).not.toContain("playwright");
  });

  it("normalizes supported shell aliases and rejects unsupported shells", () => {
    expect(parseCompletionShell("BASH")).toBe("bash");
    expect(parseCompletionShell("pwsh")).toBe("powershell");
    expect(parseCompletionShell("ps1")).toBe("powershell");

    expect(() => parseCompletionShell("cmd")).toThrow(UserFacingError);
    try {
      parseCompletionShell("cmd");
    } catch (error) {
      expect(error).toBeInstanceOf(UserFacingError);
      expect((error as UserFacingError).code).toBe("invalid_input");
      expect((error as UserFacingError).hint).toContain("zepo completion bash");
    }
  });
});

function createProgram(): Command {
  const program = new Command();
  program
    .name("zepo")
    .option("--data-dir <path>")
    .option("--debug")
    .option("--json")
    .option("--no-input")
    .option("--visible")
    .option("--browser-locale <locale>")
    .option("--browser-timezone <timezone>")
    .option("--timeout <ms>");

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
  registerCompletionCommand(program);

  return program;
}
