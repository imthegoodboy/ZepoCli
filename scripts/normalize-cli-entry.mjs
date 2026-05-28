import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const cliPath = resolve(import.meta.dirname, "..", "dist", "index.js");
const shebang = "#!/usr/bin/env node";
const source = readFileSync(cliPath, "utf8");
const firstNewline = source.indexOf("\n");

if (firstNewline === -1) {
  throw new Error("Compiled CLI entry is missing a newline after the shebang.");
}

const firstLine = source.slice(0, firstNewline);
if (firstLine !== shebang && firstLine !== `${shebang}\r`) {
  throw new Error("Compiled CLI entry must start with #!/usr/bin/env node.");
}

if (firstLine !== shebang) {
  writeFileSync(cliPath, `${shebang}\n${source.slice(firstNewline + 1)}`);
}
