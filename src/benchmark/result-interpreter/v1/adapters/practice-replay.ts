/**
 * Replay driver: reads a profile-diagnostic-summary/v3 file, maps it through
 * the practice adapter, interprets it, and writes a redacted
 * result-interpreter-summary/v1 output. No model invocation.
 *
 * Usage: bun run src/benchmark/result-interpreter/v1/adapters/practice-replay.ts <summary.json> <output.json>
 */

import { interpretPracticeSummary } from "./practice";

const [summaryPath, outputPath] = Bun.argv.slice(2);
if (!summaryPath || !outputPath) {
  throw new Error("usage: practice-replay.ts <summary.json> <output.json>");
}
const summary = JSON.parse(await Bun.file(summaryPath).text()) as unknown;
const result = interpretPracticeSummary(summary);
await Bun.write(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({
  units: result.units.map((unit) => ({
    candidate: unit.sample_unit.candidate,
    input_hash: unit.sample_unit.input_hash,
    verdict: unit.verdict,
    reasons: unit.reasons,
  })),
  overall: result.overall,
}, null, 2));