import { join } from "node:path";
import { runScenario } from "./runner";
import { assertModelArtifact, localRuntimeCompletion, validateRuntimeConfig, type LocalRuntimeConfig } from "./runtime";
import type { RunThresholds } from "./types";

type ThresholdDocument = {
  schema_version: "offline-judge-thresholds/v1";
  common: Omit<RunThresholds, "development_decisive_accuracy" | "holdout_decisive_accuracy">;
  development: { decisive_accuracy: number };
  holdout: { decisive_accuracy: number };
};

function usage(): never {
  console.error("usage: bun run src/benchmark/judge/offline-core/v1/run.ts <scenario-dir> --runtime-config <json> --claim <development|holdout> [--out <json>] [--preflight]");
  process.exit(2);
}

function option(name: string): string | undefined {
  const index = Bun.argv.indexOf(name);
  return index >= 0 ? Bun.argv[index + 1] : undefined;
}

function repeatedOption(name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < Bun.argv.length; index += 1) {
    const value = Bun.argv[index + 1];
    if (Bun.argv[index] === name && value) values.push(value);
  }
  return values;
}

function thresholdsFor(document: ThresholdDocument, claim: "development" | "holdout"): RunThresholds {
  return {
    ...document.common,
    development_decisive_accuracy: document.development.decisive_accuracy,
    holdout_decisive_accuracy: document.holdout.decisive_accuracy,
  };
}

const scenarioDir = Bun.argv[2];
const runtimePath = option("--runtime-config");
const claimValue = option("--claim");
if (!scenarioDir || !runtimePath || (claimValue !== "development" && claimValue !== "holdout")) usage();
const claim = claimValue as "development" | "holdout";
const output = option("--out");
const preflightOnly = Bun.argv.includes("--preflight");

const runtimeConfig = JSON.parse(await Bun.file(runtimePath).text()) as LocalRuntimeConfig;
validateRuntimeConfig(runtimeConfig);
await assertModelArtifact(runtimeConfig);
if (preflightOnly) {
  console.log(JSON.stringify({ ok: true, model: runtimeConfig.model, runtime: runtimeConfig.runtime }, null, 2));
  process.exit(0);
}

const thresholdDocument = JSON.parse(
  await Bun.file(join(process.cwd(), "src/benchmark/judge/offline-core/v1/private/calibration/thresholds.json")).text(),
) as ThresholdDocument;
const result = await runScenario({
  scenarioDir,
  claim,
  caseIds: repeatedOption("--case"),
  complete: localRuntimeCompletion(runtimeConfig),
  model: {
    id: runtimeConfig.model.id,
    revision: runtimeConfig.model.revision,
    quantization: runtimeConfig.model.quantization,
    file_sha256: runtimeConfig.model.file_sha256,
    file_size_bytes: runtimeConfig.model.file_size_bytes,
  },
  runtime: {
    id: runtimeConfig.runtime.id,
    version: runtimeConfig.runtime.version,
    artifact_sha256: runtimeConfig.runtime.artifact_sha256,
    binary_sha256: runtimeConfig.runtime.binary_sha256,
    base_url: runtimeConfig.base_url,
    context_size: runtimeConfig.context_size,
    temperature: runtimeConfig.temperature,
    top_k: runtimeConfig.top_k,
    seed: runtimeConfig.seed,
    max_tokens: runtimeConfig.max_tokens,
  },
  thresholds: thresholdsFor(thresholdDocument, claim),
});
const text = `${JSON.stringify(result, null, 2)}\n`;
if (output) await Bun.write(join(process.cwd(), output), text);
else console.log(text);
process.exit(result.passed ? 0 : 1);
