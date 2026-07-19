import { buildPluginManifest } from "./plugin-manifest.ts";

const file = process.argv[2];

if (!file) {
  console.error("Usage: bun run src/cli.ts <plugin-json>");
  process.exit(2);
}

let input: unknown;
try {
  input = JSON.parse(await Bun.file(file).text());
} catch {
  console.log(JSON.stringify({ manifest: null, diagnostics: [{ file, path: "/", code: "invalid-root", message: "Invalid JSON" }] }));
  process.exit(1);
}

const result = buildPluginManifest(input, file);
console.log(JSON.stringify(result));
process.exit(result.diagnostics.length === 0 ? 0 : 1);
