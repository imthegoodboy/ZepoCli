import chalk from "chalk";
import type { Command } from "commander";

import type {
  BrowserAutomationReadiness,
  LiveSessionStatus,
  SessionStatus,
  SessionStatusWithLiveCheck
} from "../types.js";
import { printJson } from "../utils/output.js";
import { wantsJson, withCommandSpinner, withRuntime } from "./shared.js";

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Show local ZepoCli session and storage status")
    .option("--live", "open Zepto and verify whether the saved session is still accepted")
    .option("--json", "print machine-readable JSON")
    .action((options: { live?: boolean; json?: boolean }, command: Command) =>
      withRuntime(command, async (runtime) => {
        const json = wantsJson(command, options);
        if (options.live) {
          const { ZeptoService } = await import("../services/zepto.js");
          const service = new ZeptoService(runtime).auth;
          const liveSession = json
            ? await service.checkLiveSession()
            : await withCommandSpinner(
                "Checking live Zepto session",
                (result) => liveSessionSuccessMessage(result),
                () => service.checkLiveSession()
              );
          const status: SessionStatusWithLiveCheck = {
            ...runtime.session.status(),
            liveSession
          };
          if (json) {
            printJson(status);
            return;
          }

          printStatus(status);
          printLiveSession(liveSession);
          return;
        }

        const status = runtime.session.status();
        if (json) {
          printJson(status);
          return;
        }

        printStatus(status);
      })
    );
}

function liveSessionSuccessMessage(status: LiveSessionStatus): string {
  if (!status.checked) {
    return "Live session check skipped.";
  }

  if (status.state === "logged-in") {
    return "Live Zepto session verified.";
  }

  if (status.demotedLocalSession) {
    return "Live Zepto session requires login again.";
  }

  return "Live Zepto session check finished.";
}

function printStatus(status: SessionStatus): void {
  const auth = status.hasAuthState ? chalk.green("present") : chalk.yellow("missing");
  const profile = status.hasBrowserProfileData ? chalk.green("present") : chalk.yellow("empty");
  const loginMarker = status.markedLoggedIn ? chalk.green("yes") : chalk.yellow("no");
  const confirmedSession = status.confirmedSession ? chalk.green("yes") : chalk.yellow("no");
  const browserLock = status.browserLock.present ? chalk.yellow(formatBrowserLockStatus(status)) : chalk.green("clear");
  const headlessThrottle = status.headlessBrowserThrottle.throttleActive
    ? chalk.yellow(`cooling down, retry after ${formatDuration(status.headlessBrowserThrottle.retryAfterMs)}`)
    : status.headlessBrowserThrottle.recentRuns > 0
      ? chalk.green(`${status.headlessBrowserThrottle.recentRuns}/${status.headlessBrowserThrottle.limit} recent runs`)
      : chalk.green("clear");
  const challenge = status.accessChallenge.cooldownActive
    ? chalk.yellow(`cooling down, retry after ${formatDuration(status.accessChallenge.retryAfterMs)}`)
    : status.accessChallenge.detected
      ? chalk.green("clear, previous challenge expired")
      : chalk.green("clear");
  const browserAutomation = status.browserAutomation.ready
    ? chalk.green("ready")
    : chalk.yellow(formatBrowserAutomationReadiness(status.browserAutomation));

  console.log(`${chalk.bold("Version:")} ${status.version}`);
  console.log(`${chalk.bold("Auth state:")} ${auth}`);
  console.log(`${chalk.bold("Browser profile:")} ${profile}`);
  console.log(`${chalk.bold("Marked logged in:")} ${loginMarker}`);
  console.log(`${chalk.bold("Confirmed session:")} ${confirmedSession}`);
  console.log(`${chalk.bold("Browser automation:")} ${browserAutomation}`);
  console.log(`${chalk.bold("Browser lock:")} ${browserLock}`);
  console.log(`${chalk.bold("Headless throttle:")} ${headlessThrottle}`);
  console.log(`${chalk.bold("Zepto challenge:")} ${challenge}`);
  console.log(
    `${chalk.bold("Cache:")} searches ${status.cache.searches}, cart snapshots ${status.cache.cartSnapshots}, addresses ${status.cache.addresses}, orders ${status.cache.orders}`
  );

  if (status.updatedAt) {
    console.log(`${chalk.bold("Last session update:")} ${status.updatedAt}`);
  }

  console.log(`${chalk.bold("Data dir:")} ${status.dataDir}`);
  console.log(`${chalk.bold("Diagnostics:")} ${status.diagnosticsDir}`);
}

function formatBrowserLockStatus(status: SessionStatus): string {
  const pid = status.browserLock.pid ? `, PID ${status.browserLock.pid}` : "";
  if (!status.browserLock.stale) {
    return `active${pid}`;
  }

  const reason =
    status.browserLock.staleReason === "process_not_running"
      ? "owner process exited"
      : status.browserLock.staleReason === "expired"
        ? "expired"
        : "stale";
  return `${reason}${pid}`;
}

function formatBrowserAutomationReadiness(status: BrowserAutomationReadiness): string {
  const reasonText = status.reasons
    .map((reason) => {
      if (reason === "browser_lock_active") {
        return "active lock";
      }
      if (reason === "headless_browser_throttle") {
        return "headless throttle";
      }
      return "Zepto cooldown";
    })
    .join(", ");
  if (status.retryAfterMs > 0) {
    return `${reasonText}, retry after ${formatDuration(status.retryAfterMs)}`;
  }

  return reasonText;
}

function printLiveSession(status: LiveSessionStatus): void {
  const state =
    status.state === "logged-in"
      ? chalk.green(status.state)
      : status.state === "login-required"
        ? chalk.yellow(status.state)
        : chalk.gray(status.state);
  console.log(`${chalk.bold("Live session:")} ${state}`);
  console.log(status.demotedLocalSession ? chalk.yellow(status.message) : chalk.gray(status.message));
  if (status.hint) {
    console.log(chalk.gray(status.hint));
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.ceil(ms / 1_000);
  if (seconds < 60) {
    return `${seconds}s`;
  }

  return `${Math.ceil(seconds / 60)}m`;
}
