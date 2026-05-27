import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const rootDir = resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf8"));
const npmExecPath = process.env.npm_execpath;

const tempRoot = mkdtempSync(join(tmpdir(), "zepo-package-smoke-"));
const packDir = join(tempRoot, "pack");
const installDir = join(tempRoot, "install");
const dataDir = join(tempRoot, "data");

try {
  mkdirSync(packDir, { recursive: true });

  runNpm(["pack", "--pack-destination", packDir, "--silent"], { cwd: rootDir });

  const tarballs = readdirSync(packDir).filter((entry) => entry.endsWith(".tgz"));
  assert(tarballs.length === 1, `expected one packed tarball, found ${tarballs.length}`);

  const tarballPath = join(packDir, tarballs[0]);
  console.log(`packed ${basename(tarballPath)}`);

  runNpm(["install", "--prefix", installDir, tarballPath, "--omit=dev", "--no-audit", "--no-fund", "--prefer-offline"], {
    cwd: rootDir
  });

  const zepoBin = resolveInstalledBin(installDir, "zepo");
  assert(existsSync(zepoBin), `expected installed zepo binary at ${zepoBin}`);

  verifyInstalledCli(zepoBin);
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

function verifyInstalledCli(zepoBin) {
  const checks = [
    {
      name: "installed version",
      args: ["--version"],
      expect: ({ status, stdout, stderr }) => {
        assert(status === 0, "expected exit code 0");
        assert(stderr === "", "expected empty stderr");
        assert(stdout === packageJson.version, "expected installed CLI version to match package.json");
      }
    },
    {
      name: "installed help",
      args: ["--help"],
      expect: ({ status, stdout }) => {
        assert(status === 0, "expected exit code 0");
        assert(stdout.includes("Developer CLI for user-directed Zepto workflows"), "expected CLI description");
        assert(stdout.includes("checkout"), "expected checkout command in help output");
      }
    },
    {
      name: "installed status json",
      args: ["--data-dir", dataDir, "status", "--json"],
      expect: ({ status, stdout, stderr }) => {
        assert(status === 0, "expected exit code 0");
        assert(stderr === "", "expected empty stderr");
        const payload = parseJson(stdout, "stdout");
        assert(payload.dataDir === dataDir, "expected status to use disposable data dir");
        assert(payload.confirmedSession === false, "expected fresh data dir to be logged out");
      }
    },
    {
      name: "installed no-input guard",
      args: ["--data-dir", dataDir, "--no-input", "login", "--json"],
      expect: (result) => {
        expectJsonError(result, "user_error", "Zepto login requires interactive input.");
      }
    }
  ];

  for (const check of checks) {
    const result = runInstalledCli(zepoBin, check.args);
    check.expect(result);
    console.log(`pass ${check.name}`);
  }
}

function resolveInstalledBin(prefixDir, commandName) {
  const binName = process.platform === "win32" ? `${commandName}.cmd` : commandName;
  return join(prefixDir, "node_modules", ".bin", binName);
}

function runInstalledCli(zepoBin, args) {
  const result = spawnInstalledBin(zepoBin, args, {
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

  return normalizeResult(result);
}

function runNpm(args, options) {
  assert(npmExecPath, "expected npm_execpath to run npm package verification");
  return run(process.execPath, [npmExecPath, ...args], options);
}

function run(command, args, options) {
  const result = spawnSync(command, args, {
    ...options,
    encoding: "utf8"
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stdout = result.stdout?.trim();
    const stderr = result.stderr?.trim();
    throw new Error(
      [
        `Command failed: ${command} ${args.join(" ")}`,
        `Exit code: ${result.status}`,
        stdout ? `stdout:\n${stdout}` : undefined,
        stderr ? `stderr:\n${stderr}` : undefined
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  return normalizeResult(result);
}

function spawnInstalledBin(command, args, options) {
  if (process.platform !== "win32") {
    return spawnSync(command, args, options);
  }

  return spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/c", `call ${formatCmd(command, args)}`], {
    ...options,
    windowsVerbatimArguments: true
  });
}

function formatCmd(command, args) {
  return [quoteCmdArg(command), ...args.map(formatCmdArg)].join(" ");
}

function formatCmdArg(value) {
  const arg = String(value);
  return /[\s"&|<>^]/.test(arg) ? quoteCmdArg(arg) : arg;
}

function quoteCmdArg(value) {
  return `"${String(value).replace(/(["^&|<>])/g, "^$1")}"`;
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
  } catch {
    throw new Error(`Could not parse ${streamName} as JSON: ${text}`);
  }
}

function normalizeResult(result) {
  return {
    status: result.status ?? 1,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim()
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
