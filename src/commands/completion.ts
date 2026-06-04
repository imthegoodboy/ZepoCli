import type { Command, Option } from "commander";

import { UserFacingError } from "../utils/errors.js";

const COMPLETION_SHELLS = ["bash", "zsh", "fish", "powershell"] as const;
const BUILT_IN_HELP_OPTION: CompletionOption = {
  description: "display help for command",
  flags: ["-h", "--help"],
  takesValue: false
};
const BUILT_IN_HELP_COMMAND = "help";

export type CompletionShell = (typeof COMPLETION_SHELLS)[number];

interface CompletionOption {
  description: string;
  flags: string[];
  takesValue: boolean;
}

interface CompletionCommand {
  description: string;
  options: CompletionOption[];
  path: string[];
  subcommands: string[];
}

interface CompletionSpec {
  commandName: string;
  commands: CompletionCommand[];
  globalOptions: CompletionOption[];
}

export function registerCompletionCommand(program: Command): void {
  program
    .command("completion")
    .description("Generate a shell completion script")
    .argument("<shell>", "shell to generate: bash, zsh, fish, or powershell")
    .action((shellInput: string) => {
      const shell = parseCompletionShell(shellInput);
      console.log(renderCompletionScript(shell, buildCompletionSpec(program)));
    });
}

export function parseCompletionShell(input: string): CompletionShell {
  const normalized = input.trim().toLowerCase();
  if (normalized === "pwsh" || normalized === "ps1") {
    return "powershell";
  }

  if (isCompletionShell(normalized)) {
    return normalized;
  }

  throw new UserFacingError("Unsupported completion shell.", {
    code: "invalid_input",
    hint: "Use `zepo completion bash`, `zepo completion zsh`, `zepo completion fish`, or `zepo completion powershell`."
  });
}

export function buildCompletionSpec(root: Command): CompletionSpec {
  const commands: CompletionCommand[] = [];
  const globalOptions = root.options.map(toCompletionOption);
  const rootCommandNames = root.commands.map((child) => child.name());

  const visit = (command: Command, path: string[]) => {
    commands.push({
      description: command.description(),
      options: command.options.map(toCompletionOption),
      path,
      subcommands:
        path.length === 0 ? [...rootCommandNames, BUILT_IN_HELP_COMMAND] : command.commands.map((child) => child.name())
    });

    for (const child of command.commands) {
      visit(child, [...path, child.name()]);
    }
  };

  visit(root, []);
  const registeredCommands = [...commands];
  commands.push({
    description: "display help for command",
    options: [],
    path: [BUILT_IN_HELP_COMMAND],
    subcommands: rootCommandNames
  });
  for (const command of registeredCommands.filter((candidate) => candidate.path.length > 0)) {
    commands.push({
      description: `display help for ${pathKey(command.path)}`,
      options: [],
      path: [BUILT_IN_HELP_COMMAND, ...command.path],
      subcommands: command.subcommands
    });
  }

  return {
    commandName: root.name(),
    commands,
    globalOptions
  };
}

export function renderCompletionScript(shell: CompletionShell, spec: CompletionSpec): string {
  switch (shell) {
    case "bash":
      return renderBashCompletion(spec);
    case "zsh":
      return renderZshCompletion(spec);
    case "fish":
      return renderFishCompletion(spec);
    case "powershell":
      return renderPowerShellCompletion(spec);
  }
}

function renderBashCompletion(spec: CompletionSpec): string {
  const knownPaths = spec.commands
    .map((command) => pathKey(command.path))
    .filter(Boolean)
    .join("|");
  const valueOptions = valueOptionFlags(spec).join(" ");
  const cases = spec.commands
    .map((command) => {
      const pattern = command.path.length === 0 ? '""' : escapeShellCasePattern(pathKey(command.path));
      return `    ${pattern}) candidates=${shellSingleQuote(commandCandidates(spec, command).join(" "))} ;;`;
    })
    .join("\n");

  return [
    `_${spec.commandName}_completion() {`,
    "  local cur path candidates skip_next word candidate",
    '  cur="${COMP_WORDS[COMP_CWORD]}"',
    '  path=""',
    "  skip_next=0",
    "  for ((i = 1; i < COMP_CWORD; i++)); do",
    '    word="${COMP_WORDS[i]}"',
    "    if [[ $skip_next -eq 1 ]]; then",
    "      skip_next=0",
    "      continue",
    "    fi",
    `    case " ${valueOptions} " in *" $word "*) skip_next=1; continue ;; esac`,
    '    [[ "$word" == --*=* || "$word" == -* ]] && continue',
    '    candidate="${path:+$path }$word"',
    `    case "|${knownPaths}|" in *"|$candidate|"*) path="$candidate" ;; esac`,
    "  done",
    '  case "$path" in',
    cases,
    "    *) candidates=" + shellSingleQuote(rootCandidates(spec).join(" ")) + " ;;",
    "  esac",
    '  COMPREPLY=( $(compgen -W "$candidates" -- "$cur") )',
    "}",
    `complete -F _${spec.commandName}_completion ${spec.commandName}`
  ].join("\n");
}

function renderZshCompletion(spec: CompletionSpec): string {
  const allCandidates = allCompletionCandidates(spec)
    .map((candidate) => `${candidate}\\:${candidate}`)
    .join(" ");

  return [
    `#compdef ${spec.commandName}`,
    "",
    `_${spec.commandName}_completion() {`,
    "  local -a candidates",
    `  candidates=(${allCandidates})`,
    "  _describe 'command or option' candidates",
    "}",
    "",
    `_${spec.commandName}_completion "$@"`
  ].join("\n");
}

function renderFishCompletion(spec: CompletionSpec): string {
  const lines = [`complete -c ${spec.commandName} -f`];

  for (const candidate of rootCandidates(spec)) {
    if (candidate.startsWith("--")) {
      continue;
    }
    lines.push(`complete -c ${spec.commandName} -a ${shellSingleQuote(candidate)}`);
  }

  for (const option of uniqueOptions([...spec.globalOptions, ...spec.commands.flatMap((command) => command.options)])) {
    for (const flag of option.flags) {
      const name = flag.replace(/^-+/, "");
      const kind = flag.startsWith("--") ? "-l" : "-s";
      const requirement = option.takesValue ? " -r" : "";
      lines.push(
        `complete -c ${spec.commandName} ${kind} ${shellSingleQuote(name)}${requirement} -d ${shellSingleQuote(option.description)}`
      );
    }
  }

  for (const command of spec.commands.filter((candidate) => candidate.path.length > 0 && candidate.subcommands.length > 0)) {
    lines.push(
      `complete -c ${spec.commandName} -n ${shellSingleQuote(`__fish_seen_subcommand_from ${pathKey(command.path)}`)} -a ${shellSingleQuote(command.subcommands.join(" "))}`
    );
  }

  return lines.join("\n");
}

function renderPowerShellCompletion(spec: CompletionSpec): string {
  const candidates = allCompletionCandidates(spec);

  return [
    `Register-ArgumentCompleter -Native -CommandName ${powershellString(spec.commandName)} -ScriptBlock {`,
    "  param($wordToComplete)",
    `  $candidates = @(${candidates.map(powershellString).join(", ")})`,
    '  $candidates | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {',
    "    [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)",
    "  }",
    "}"
  ].join("\n");
}

function toCompletionOption(option: Option): CompletionOption {
  return {
    description: option.description,
    flags: [option.short, option.long].filter((flag): flag is string => Boolean(flag)),
    takesValue: option.flags.includes("<") || option.flags.includes("[")
  };
}

function commandCandidates(spec: CompletionSpec, command: CompletionCommand): string[] {
  return unique([
    ...command.subcommands,
    ...BUILT_IN_HELP_OPTION.flags,
    ...spec.globalOptions.flatMap((option) => option.flags),
    ...command.options.flatMap((option) => option.flags)
  ]);
}

function rootCandidates(spec: CompletionSpec): string[] {
  const root = spec.commands.find((command) => command.path.length === 0);
  return root ? commandCandidates(spec, root) : [];
}

function allCompletionCandidates(spec: CompletionSpec): string[] {
  return unique([
    ...spec.commands.flatMap((command) => [command.path.at(-1) ?? "", ...command.subcommands]),
    ...BUILT_IN_HELP_OPTION.flags,
    ...spec.globalOptions.flatMap((option) => option.flags),
    ...spec.commands.flatMap((command) => command.options.flatMap((option) => option.flags))
  ]).filter(Boolean);
}

function valueOptionFlags(spec: CompletionSpec): string[] {
  return unique([
    ...spec.globalOptions.filter((option) => option.takesValue).flatMap((option) => option.flags),
    ...spec.commands.flatMap((command) =>
      command.options.filter((option) => option.takesValue).flatMap((option) => option.flags)
    )
  ]);
}

function uniqueOptions(options: CompletionOption[]): CompletionOption[] {
  const byFlags = new Map<string, CompletionOption>();
  for (const option of [BUILT_IN_HELP_OPTION, ...options]) {
    byFlags.set(option.flags.join("|"), option);
  }
  return [...byFlags.values()];
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function pathKey(path: string[]): string {
  return path.join(" ");
}

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function escapeShellCasePattern(value: string): string {
  return value.replace(/ /g, "\\ ");
}

function powershellString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function isCompletionShell(value: string): value is CompletionShell {
  return COMPLETION_SHELLS.includes(value as CompletionShell);
}
