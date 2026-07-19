import { buildPublishIndex } from "./publish-check.ts";
const [packsFile, entrypointsFile] = process.argv.slice(2);
if (!packsFile || !entrypointsFile) { console.error("Usage: bun run src/cli.ts <packs-json> <entrypoints-json>"); process.exit(2); }
const result = buildPublishIndex(JSON.parse(await Bun.file(packsFile).text()), JSON.parse(await Bun.file(entrypointsFile).text()));
console.log(JSON.stringify(result)); process.exit(result.diagnostics.length === 0 ? 0 : 1);
