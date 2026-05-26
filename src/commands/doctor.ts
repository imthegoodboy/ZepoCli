import chalk from "chalk";
import type { Command } from "commander";

import { DoctorService } from "../services/doctor.js";
import type { DoctorCheck, DoctorReport } from "../types.js";
import { printJson } from "../utils/output.js";
import { withRuntime } from "./shared.js";

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Check local ZepoCli environment readiness")
    .option("--json", "print machine-readable JSON")
    .option("--skip-browser", "skip the Playwright Chromium launch check")
    .action((options: { json?: boolean; skipBrowser?: boolean }, command: Command) =>
      withRuntime(command, async (runtime) => {
        const report = await new DoctorService(runtime).run({
          browser: !(options.skipBrowser ?? false)
        });

        if (options.json) {
          printJson(report);
        } else {
          printDoctorReport(report);
        }

        if (!report.ok) {
          process.exitCode = 1;
        }
      })
    );
}

function printDoctorReport(report: DoctorReport): void {
  console.log(chalk.bold("ZepoCli doctor"));
  for (const check of report.checks) {
    console.log(`${statusLabel(check)} ${chalk.bold(check.name)}: ${check.message}`);
    if (check.hint) {
      console.log(chalk.gray(`  ${check.hint}`));
    }
  }
}

function statusLabel(check: DoctorCheck): string {
  if (check.status === "pass") {
    return chalk.green("PASS");
  }

  if (check.status === "warn") {
    return chalk.yellow("WARN");
  }

  return chalk.red("FAIL");
}
