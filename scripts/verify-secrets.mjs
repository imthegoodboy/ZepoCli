import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";

const rootDir = resolve(import.meta.dirname, "..");
const skippedDirectories = new Set([".git", "coverage", "dist", "node_modules"]);
const scannedExtensions = new Set([".json", ".md", ".mjs", ".ts", ".tsx", ".yml", ".yaml"]);
const scannedFileNames = new Set([".env.example", ".gitattributes", ".gitignore", ".npmrc.example", "LICENSE"]);
const npmTokenPattern = /npm_[A-Za-z0-9]{20,}/g;

const findings = [];

for (const filePath of collectCandidateTextFiles()) {
  const text = readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (npmTokenPattern.test(line)) {
      findings.push(`${relative(rootDir, filePath)}:${index + 1}: <redacted-npm-token>`);
    }

    npmTokenPattern.lastIndex = 0;
  });
}

if (findings.length > 0) {
  console.error("Secret verification failed. Remove npm tokens from tracked project text:");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log("pass secret verification");

function collectCandidateTextFiles() {
  const gitFiles = collectGitFiles();

  if (gitFiles !== undefined) {
    return gitFiles
      .filter((filePath) => !hasSkippedSegment(filePath))
      .filter((filePath) => isTextFile(filePath, { includeLocalSecretConfigNames: true }))
      .map((filePath) => resolve(rootDir, filePath));
  }

  return collectTextFiles(rootDir);
}

function collectGitFiles() {
  try {
    const output = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });

    return output.split("\0").filter(Boolean);
  } catch {
    return undefined;
  }
}

function collectTextFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      return isSkippedDirectoryName(entry.name) ? [] : collectTextFiles(fullPath);
    }

    if (!entry.isFile()) {
      return [];
    }

    return isTextFile(entry.name, { includeLocalSecretConfigNames: false }) ? [fullPath] : [];
  });
}

function isTextFile(filePath, options) {
  const name = basename(filePath);

  if (options.includeLocalSecretConfigNames && isLocalSecretConfigName(name)) {
    return true;
  }

  return scannedFileNames.has(name) || scannedExtensions.has(extname(name));
}

function isLocalSecretConfigName(name) {
  return name === ".env" || name.startsWith(".env.") || name === ".npmrc" || name.startsWith(".npmrc.");
}

function hasSkippedSegment(filePath) {
  return filePath.split(/[\\/]/).some((segment) => isSkippedDirectoryName(segment));
}

function isSkippedDirectoryName(name) {
  return skippedDirectories.has(name) || name === ".zepo" || name.startsWith(".zepo-");
}
