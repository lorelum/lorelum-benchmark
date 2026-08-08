/**
 * #92 replay driver: reads a corpus manifest, resolves v3 summaries under a root
 * directory, consolidates units (with slot replacements), interprets them, and
 * writes a redacted JSON report + markdown report (and per-unit JSON) to an output
 * directory. No model invocation.
 *
 * Usage: bun run src/benchmark/result-interpreter/v1/adapters/practice-corpus-report.ts <manifest.json> <rootDir> <outDir>
 */

import { mkdir } from "node:fs/promises";
import { practiceCorpusReport, practiceCorpusReportMarkdown } from "./practice-corpus";

const [manifestPath, rootDir, outDir] = Bun.argv.slice(2);
if (!manifestPath || !rootDir || !outDir) {
  throw new Error("usage: practice-corpus-report.ts <manifest.json> <rootDir> <outDir>");
}
const manifest = JSON.parse(await Bun.file(manifestPath).text()) as unknown;
const sourcesRecord = (manifest as { sources: Record<string, string> }).sources;
const summaries: Record<string, unknown> = {};
for (const [name, rel] of Object.entries(sourcesRecord)) {
  const path = `${rootDir}/${rel}`;
  // Missing source files stay undefined so the report records a missing-summary gap
  // instead of crashing; units depending on them flip the aggregate to uncertain.
  if (await Bun.file(path).exists()) {
    summaries[name] = JSON.parse(await Bun.file(path).text()) as unknown;
  }
}
const report = practiceCorpusReport(manifest, summaries);
await mkdir(`${outDir}/units`, { recursive: true });
await Bun.write(`${outDir}/corpus-report.json`, `${JSON.stringify(report, null, 2)}\n`);
await Bun.write(`${outDir}/report.md`, practiceCorpusReportMarkdown(report));
for (const unit of report.units) {
  const filename = `${unit.candidate}__${unit.profile_input_hash.slice(0, 12)}.json`;
  await Bun.write(`${outDir}/units/${filename}`, `${JSON.stringify({ schema_version: "result-interpreter-summary/v1", unit }, null, 2)}\n`);
}
console.log(JSON.stringify({
  units: report.units.map((unit) => ({ candidate: unit.candidate, profile_input_hash: unit.profile_input_hash, verdict: unit.verdict, reasons: unit.reasons })),
  overall: report.aggregate.overall,
  gaps: report.aggregate.execution_gaps,
}, null, 2));