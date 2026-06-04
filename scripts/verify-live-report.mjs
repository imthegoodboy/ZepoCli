#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { validateLiveReportAcceptance } from "./live-report-utils.mjs";

const rootDir = resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf8"));
const MIN_REPORT_MAX_AGE_MINUTES = 1;
const MAX_REPORT_MAX_AGE_MINUTES = 7 * 24 * 60;
const options = parseArgs(process.argv.slice(2));

if (options.help) {
  printHelp();
  process.exit(0);
}

if (options.error) {
  console.error(options.error);
  console.error("Run `npm --silent run verify:live:report -- --help` for usage.");
  process.exit(1);
}

let report;
try {
  report = JSON.parse(readFileSync(options.reportPath, "utf8"));
} catch {
  console.error("Could not read a valid live verification report JSON file.");
  process.exit(1);
}

const result = validateLiveReportAcceptance(report, {
  expectedVersion: packageJson.version,
  maxAgeMs: options.maxAgeMs,
  requireProductionScope: options.requireProductionScope
});

if (!result.accepted) {
  console.error("Live verification report is not acceptable.");
  for (const issue of result.issues) {
    console.error(`- ${issue.code}: ${issue.message}`);
  }
  process.exit(1);
}

console.log("pass live verification report acceptance");

function parseArgs(args) {
  const parsed = {
    help: false,
    maxAgeMs: undefined,
    requireProductionScope: false,
    reportPath: ""
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }

    if (arg === "--require-production-scope") {
      parsed.requireProductionScope = true;
      continue;
    }

    if (arg === "--max-age-minutes") {
      const value = args[++index];
      if (!value || value.startsWith("-")) {
        return {
          ...parsed,
          error: "--max-age-minutes requires a value."
        };
      }

      const maxAgeMinutes = parseMaxAgeMinutes(value);
      if (maxAgeMinutes === undefined) {
        return {
          ...parsed,
          error: `--max-age-minutes must be an integer from ${MIN_REPORT_MAX_AGE_MINUTES} to ${MAX_REPORT_MAX_AGE_MINUTES}.`
        };
      }

      parsed.maxAgeMs = maxAgeMinutes * 60 * 1_000;
      continue;
    }

    if (arg.startsWith("-")) {
      return {
        ...parsed,
        error: "Unsupported option for live report verification."
      };
    }

    if (parsed.reportPath) {
      return {
        ...parsed,
        error: "Expected exactly one live report path."
      };
    }

    parsed.reportPath = arg;
  }

  if (!parsed.reportPath && !parsed.help) {
    return {
      ...parsed,
      error: "Missing required live report path."
    };
  }

  return parsed;
}

function parseMaxAgeMinutes(value) {
  if (!/^\d+$/.test(value)) {
    return undefined;
  }

  const minutes = Number.parseInt(value, 10);
  if (
    !Number.isInteger(minutes) ||
    minutes < MIN_REPORT_MAX_AGE_MINUTES ||
    minutes > MAX_REPORT_MAX_AGE_MINUTES
  ) {
    return undefined;
  }

  return minutes;
}

function printHelp() {
  console.log(`Usage: npm --silent run verify:live:report -- [--require-production-scope] [--max-age-minutes <minutes>] <live-verification-report.json>

Validates that a human-controlled verify:live report is acceptable evidence for the requested scope.
Use --require-production-scope for final readiness: it also requires --max-age-minutes plus browser preflight, local status, live session, address selection, search, add, non-empty cart, checkout handoff, and track to be requested and covered without focused cleanup/history workflows. The checkout step must come from explicit --checkout-wait evidence.
Use --max-age-minutes so old saved reports cannot be reused as current evidence.

This command does not contact Zepto and does not prove a fresh live run happened. It checks the report contract:
- package version matches
- ok is true
- non-future generatedAt, data/report path metadata, and the fixed report note match the sanitized runner shape
- when --max-age-minutes is used, generatedAt is not older than the requested freshness window
- report fields match the accepted schema
- requested, attempted, coverage, and missingCoverage are complete boolean capability maps
- attempted and coverage summaries match the steps array
- ok reports contain only passing known workflow steps with no duplicate workflow step names and preserve runner workflow order
- step summaries include every runner-defined key
- step summary values keep the runner's expected types
- string and string-array step summary values stay within runner-known values
- related step summary fields are internally consistent
- numeric step summary values stay within runner-supported ranges
- all passing workflow step summaries satisfy their known contracts
- login step summaries confirm saved session evidence when login runs
- stored step command strings match the redacted command contract
- manual/internal command markers are accepted only for runner-defined precondition/internal failure steps
- step exitCode, ok, summary, and error fields are internally consistent
- failure error objects keep stable code, message, hint, and bounded retryAfterMs fields
- sensitive-looking report keys and values have been redacted
- requested capabilities have passing coverage
- missingCoverage has no true values
- required step summaries are present for browser preflight, local status readiness, live session, checkout handoff, checkout cart precondition, and requested workflows
- checkout_manual_action_required is manual continuation evidence only and is not accepted as checkout handoff coverage
- when --require-production-scope is used, the core login/session, search, address, non-empty cart, checkout handoff, and track workflow was requested and has passing coverage
- when --require-production-scope is used, --max-age-minutes is also used so the report is fresh evidence
- when --require-production-scope is used, checkout evidence comes from explicit --checkout-wait so a human can complete Zepto-side checkout/payment before tracking
- when --require-production-scope is used, address-add, address-list, remove, clear, history, and reorder workflows are not requested, attempted, or covered

Example:
  npm --silent run verify:live:report -- --require-production-scope --max-age-minutes 1440 ./.zepo-live/live-verification-report.json`);
}
