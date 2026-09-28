import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { sha256File, sha256Text } from "../../../fs";
import { judgePairCase, validateScenarioBundle } from "./core";
import { computeMetrics, evaluateThresholds } from "./metrics";
import { systemPrompt } from "./prompt";
import type {
  ModelCompletion,
  RunIdentity,
  RunThresholds,
  ScenarioAdapter,
  ScenarioBundle,
  ScenarioRunResult,
} from "./types";

export const coreFileNames = [
  "types.ts",
  "prompt.ts",
  "core.ts",
  "runtime.ts",
  "metrics.ts",
  "runner.ts",
] as const;

export async function loadScenarioAdapter(scenarioDir: string): Promise<ScenarioBundle> {
  const adapterPath = join(scenarioDir, "adapter.ts");
  const module = await import(pathToFileURL(adapterPath).href) as { default?: ScenarioAdapter; loadScenario?: ScenarioAdapter["loadScenario"] };
  const load = module.loadScenario ?? module.default?.loadScenario;
  if (!load) throw new Error(`Scenario adapter must export loadScenario: ${adapterPath}`);
  return load(scenarioDir);
}

export async function coreFileHashes(): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  for (const name of coreFileNames) hashes[name] = await sha256File(join(import.meta.dir, name));
  return hashes;
}

export async function coreHash(): Promise<string> {
  const hashes = await coreFileHashes();
  return sha256Text(Object.entries(hashes).map(([name, hash]) => `${name}\0${hash}`).join("\n"));
}

async function buildIdentity(input: {
  bundle: ScenarioBundle;
  runtime: RunIdentity["runtime"];
  model: RunIdentity["model"];
  thresholds: RunThresholds;
}): Promise<RunIdentity> {
  const identityBase = {
    scenario: {
      id: input.bundle.profile.id,
      version: input.bundle.profile.version,
      adapter_version: input.bundle.profile.adapter_version,
    },
    core_hash: await coreHash(),
    system_prompt_hash: await sha256Text(systemPrompt()),
    rubric_hash: await sha256Text(JSON.stringify(input.bundle.rubric)),
    labels_hash: await sha256Text(JSON.stringify(input.bundle.labels)),
    model: input.model,
    runtime: input.runtime,
    threshold: input.thresholds,
  };
  return {
    run_id: await sha256Text(JSON.stringify(identityBase)),
    ...identityBase,
  };
}

export async function runScenario(input: {
  scenarioDir: string;
  claim: "development" | "holdout";
  caseIds?: string[];
  complete: ModelCompletion;
  model: RunIdentity["model"];
  runtime: RunIdentity["runtime"];
  thresholds: RunThresholds;
}): Promise<ScenarioRunResult> {
  const loaded = await loadScenarioAdapter(input.scenarioDir);
  validateScenarioBundle(loaded);
  const selectedCases = input.caseIds?.length
    ? loaded.cases.filter((pairCase) => input.caseIds!.includes(pairCase.id))
    : loaded.cases;
  const selectedIds = new Set(selectedCases.map((pairCase) => pairCase.id));
  const bundle = {
    ...loaded,
    cases: selectedCases,
    labels: loaded.labels.filter((label) => selectedIds.has(label.case_id)),
  };
  const identity = await buildIdentity({
    bundle,
    model: input.model,
    runtime: input.runtime,
    thresholds: input.thresholds,
  });
  const decisions = [];
  for (const pairCase of bundle.cases) {
    decisions.push(await judgePairCase({ bundle, case: pairCase, orientation: "AB", complete: input.complete }));
    decisions.push(await judgePairCase({ bundle, case: pairCase, orientation: "BA", complete: input.complete }));
  }
  const { metrics } = computeMetrics({ cases: bundle.cases, labels: bundle.labels, decisions });
  const checks = evaluateThresholds({ metrics, thresholds: input.thresholds, claim: input.claim });
  return {
    schema_version: "offline-judge-run/v1",
    identity,
    thresholds: input.thresholds,
    metrics,
    checks,
    passed: Object.values(checks).every(Boolean),
    decisions,
  };
}
