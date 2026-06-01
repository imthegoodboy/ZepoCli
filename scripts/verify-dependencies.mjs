import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const rootDir = process.env.ZEPOCLI_VERIFY_DEPENDENCIES_ROOT
  ? resolve(process.env.ZEPOCLI_VERIFY_DEPENDENCIES_ROOT)
  : resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf8"));
const requireFromRoot = createRequire(resolve(rootDir, "package.json"));
const packageSections = [
  { name: "dependency", packages: Object.keys(packageJson.dependencies ?? {}), importPackages: true },
  {
    name: "devDependency",
    packages: Object.keys(packageJson.devDependencies ?? {}),
    importPackages: false
  }
];
const requiredDevBinaries = [
  { packageName: "typescript", binaryName: "tsc" },
  { packageName: "vitest", binaryName: "vitest" },
  { packageName: "tsx", binaryName: "tsx" }
];
const failures = [];
const missingPackages = new Set();

for (const section of packageSections) {
  for (const packageName of section.packages) {
    if (!hasInstalledPackage(packageName)) {
      missingPackages.add(packageName);
      failures.push(`Missing ${section.name} package ${packageName}.`);
    }
  }
}

for (const section of packageSections) {
  if (!section.importPackages) {
    continue;
  }

  for (const packageName of section.packages) {
    if (missingPackages.has(packageName) || packageName.startsWith("@types/")) {
      continue;
    }

    try {
      const resolvedModule = requireFromRoot.resolve(packageName);
      await import(pathToFileURL(resolvedModule).href);
    } catch {
      failures.push(`Could not load ${section.name} package ${packageName}; reinstall dependencies.`);
    }
  }
}

for (const requirement of requiredDevBinaries) {
  if (!packageJson.devDependencies?.[requirement.packageName]) {
    continue;
  }

  if (!hasInstalledBinary(requirement.binaryName)) {
    failures.push(`Missing devDependency binary ${requirement.binaryName}.`);
  }
}

if (failures.length > 0) {
  console.error("Dependency readiness check failed.");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  console.error("");
  console.error("Run:");
  console.error("  npm ci --include=prod --include=dev");
  console.error("Then retry:");
  console.error("  npm run check");
  console.error("");
  console.error("If your npm config omits dev dependencies, the --include flags are required for local development.");
  process.exitCode = 1;
} else {
  console.log("Dependency readiness check passed.");
}

function hasInstalledPackage(packageName) {
  return existsSync(join(rootDir, "node_modules", ...packageName.split("/"), "package.json"));
}

function hasInstalledBinary(binaryName) {
  return ["", ".cmd", ".ps1"].some((extension) =>
    existsSync(join(rootDir, "node_modules", ".bin", `${binaryName}${extension}`))
  );
}
