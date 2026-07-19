import { validateConfig } from "./config.ts";
const file = process.argv[2];
if (!file) { console.error("Usage: bun run src/cli.ts <config-json>"); process.exit(2); }
let input: unknown;
try { input = JSON.parse(await Bun.file(file).text()); } catch { console.log(JSON.stringify({ config: null, diagnostics: [{ path: "/", code: "invalid-json", message: "Invalid JSON" }] })); process.exit(1); }
const result = validateConfig(input);
console.log(JSON.stringify(result));
process.exit(result.diagnostics.length === 0 ? 0 : 1);
