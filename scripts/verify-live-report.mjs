#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { validateLiveReportAcceptance } from "./live-report-utils.mjs";

const rootDir = resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf8"));
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
  expectedVersion: packageJson.version
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
    reportPath: ""
  };

  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
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

function printHelp() {
  console.log(`Usage: npm --silent run verify:live:report -- <live-verification-report.json>

Validates that a human-controlled verify:live report is acceptable evidence for the requested scope.

This command does not contact Zepto and does not prove a fresh live run happened. It checks the report contract:
- package version matches
- ok is true
- generatedAt and data/report path metadata match the sanitized runner shape
- report fields match the accepted schema
- requested, attempted, coverage, and missingCoverage are complete boolean capability maps
- attempted and coverage summaries match the steps array
- ok reports contain only passing known workflow steps with no duplicate workflow step names
- stored step command strings match the redacted command contract
- step exitCode, ok, summary, and error fields are internally consistent
- sensitive-looking report keys and values have been redacted
- requested capabilities have passing coverage
- missingCoverage has no true values
- required step summaries are present for browser preflight, live session, checkout handoff, and requested workflows

Example:
  npm --silent run verify:live:report -- ./.zepo-live/live-verification-report.json`);
}
