import { readdir } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { buildRegistryIndex, type EntrySource } from "./registry-check.ts";

const registryFile = process.argv[2];
const entriesDirectory = process.argv[3];

if (!registryFile || !entriesDirectory) {
  console.error("Usage: bun run src/cli.ts <registry-json> <entries-directory>");
  process.exit(2);
}

let registry: unknown;
try {
  registry = JSON.parse(await Bun.file(registryFile).text());
} catch {
  console.log(JSON.stringify({ index: null, diagnostics: [{ file: registryFile, path: "/", code: "invalid-registry", message: "Invalid JSON" }] }));
  process.exit(1);
}

const entrySources: EntrySource[] = [];
for (const name of await readdir(entriesDirectory)) {
  if (!name.endsWith(".json")) continue;
  const file = join(entriesDirectory, name);
  try {
    entrySources.push({ file: relative("fixtures", file).replaceAll("\\", "/"), value: JSON.parse(await Bun.file(file).text()) });
  } catch {
    entrySources.push({ file: `entries/${basename(file)}`, value: null });
  }
}

const result = buildRegistryIndex(registry, registryFile, entrySources);
console.log(JSON.stringify(result));
process.exit(result.diagnostics.length === 0 ? 0 : 1);
