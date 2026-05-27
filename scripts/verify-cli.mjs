import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const rootDir = resolve(import.meta.dirname, "..");
const cliPath = resolve(rootDir, "dist", "index.js");

const checks = [
  {
    name: "help",
    args: ["--help"],
    expect: ({ status, stdout }) => {
      assert(status === 0, "expected exit code 0");
      assert(stdout.includes("Developer CLI for user-directed Zepto workflows"), "expected CLI description");
      assert(stdout.includes("--no-input"), "expected --no-input in help output");
      assert(stdout.includes("checkout"), "expected checkout command in help output");
    }
  },
  {
    name: "status json",
    args: ({ dataDir }) => ["--data-dir", dataDir, "status", "--json"],
    expect: ({ status, stdout }, { dataDir }) => {
      assert(status === 0, "expected exit code 0");
      const payload = parseJson(stdout, "stdout");
      assert(payload.dataDir === dataDir, "expected status to use disposable data dir");
      assert(payload.confirmedSession === false, "expected fresh data dir to be logged out");
    }
  },
  {
    name: "logout json",
    args: ({ dataDir }) => ["--data-dir", dataDir, "logout", "--json"],
    expect: ({ status, stdout, stderr }) => {
      assert(status === 0, "expected exit code 0");
      assert(stderr === "", "expected empty stderr");
      const payload = parseJson(stdout, "stdout");
      assert(payload.sessionRemoved === true, "expected logout confirmation");
    }
  },
  {
    name: "json invalid input",
    args: ["--timeout", "abc", "status", "--json"],
    expect: (result) => {
      expectJsonError(result, "invalid_input", "Invalid input.");
    }
  },
  {
    name: "json no session",
    args: ({ dataDir }) => ["--data-dir", dataDir, "cart", "--json"],
    expect: (result) => {
      expectJsonError(result, "user_error", "No confirmed Zepto session found.");
    }
  },
  {
    name: "no input login",
    args: ({ dataDir }) => ["--data-dir", dataDir, "--no-input", "login", "--json"],
    expect: (result) => {
      expectJsonError(result, "user_error", "Zepto login requires interactive input.");
    }
  },
  {
    name: "no input address add",
    args: ({ dataDir }) => ["--data-dir", dataDir, "--no-input", "address", "add", "--json"],
    expect: (result) => {
      expectJsonError(result, "user_error", "Zepto address add requires interactive input.");
    }
  },
  {
    name: "no input checkout",
    args: ({ dataDir }) => ["--data-dir", dataDir, "--no-input", "checkout", "--json"],
    expect: (result) => {
      expectJsonError(result, "user_error", "Zepto checkout requires interactive input.");
    }
  },
  {
    name: "no input choose",
    args: ({ dataDir }) => ["--data-dir", dataDir, "--no-input", "add", "milk", "--choose", "--json"],
    expect: (result) => {
      expectJsonError(result, "user_error", "Interactive product selection requires input.");
    }
  }
];

for (const check of checks) {
  const dataDir = mkdtempSync(join(tmpdir(), "zepo-cli-smoke-"));
  try {
    const args = typeof check.args === "function" ? check.args({ dataDir }) : check.args;
    const result = runCli(args);
    check.expect(result, { dataDir });
    console.log(`pass ${check.name}`);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
}

function runCli(args) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: rootDir,
    encoding: "utf8",
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1"
    }
  });

  if (result.error) {
    throw result.error;
  }

  return {
    status: result.status ?? 1,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim()
  };
}

function expectJsonError(result, type, message) {
  assert(result.status === 1, "expected exit code 1");
  assert(result.stdout === "", "expected empty stdout");
  const payload = parseJson(result.stderr, "stderr");
  assert(payload.ok === false, "expected ok false");
  assert(payload.error?.type === type, `expected error type ${type}`);
  assert(payload.error?.message === message, `expected error message ${message}`);
  assert(payload.error?.exitCode === 1, "expected error exitCode 1");
}

function parseJson(text, streamName) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Could not parse ${streamName} as JSON: ${text}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
