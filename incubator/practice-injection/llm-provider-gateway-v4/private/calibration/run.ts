import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { evaluateTwoStageStructure } from "../../../../../src/benchmark/evaluator/two-stage-structure/v1/analyze";
import { resolveCalibrationSets, stageCalibrationSets } from "../../../../../src/benchmark/kernel/core/v1/calibration-fixtures";
import { sha256File, sha256Text } from "../../../../../src/benchmark/fs";
import { isGeneratedWorkspacePath } from "../../../../../src/benchmark/kernel/profiles/shared/workspace-generated/v1";
import type { Stage1Snapshot } from "../../../../../src/benchmark/evaluator/two-stage-structure/v1/types";

const candidate = resolve(import.meta.dirname, "..", "..");
const stage1Root = join(candidate, "public/starter/app");
const expectedRoot = join(candidate, "private/calibration/sets/two-stage-structure/v1/overlays");
const fixtureIds = ["ambiguous-code", "anti-pattern", "baseline-scatter", "docs-present", "equivalent-reference", "oracle-reference", "public-starter"];

async function manifest(): Promise<Stage1Snapshot> {
  const paths = (await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: stage1Root, onlyFiles: true }))).sort().filter(path => !isGeneratedWorkspacePath(path));
  const files = await Promise.all(paths.map(async path => ({ path, sha256: await sha256File(join(stage1Root, path)) })));
  return { hash_algorithm: "sha256", tree_sha256: await sha256Text(files.map(file => `${file.path}:${file.sha256}`).join("\n")), files };
}

const resolved = await resolveCalibrationSets(candidate);
if (!resolved) throw new Error("two-stage calibration set manifest is missing");
const staging = await mkdtemp(join(tmpdir(), "v4-calibration-"));
const staged = await stageCalibrationSets(resolved, staging);
const snapshot = await manifest();
const results: Array<{ id: string; passed: boolean; observed?: Record<string, string>; expected?: Record<string, string> }> = [];
try {
  const set = resolved.sets["two-stage-structure/v1"];
  if (!set) throw new Error("two-stage calibration set was not staged");
  for (const id of fixtureIds) {
    const expectedDocument = Bun.YAML.parse(await Bun.file(join(expectedRoot, `${id}.expected.yaml`)).text()) as { semantic: { stage_1: "pass" | "fail"; stage_2: "pass" | "fail" }; expected: Record<string, string> };
    const fixture = set.fixtures[id];
    if (!fixture) throw new Error(`two-stage calibration fixture is missing: ${id}`);
    const stage2Root = await mkdtemp(join(tmpdir(), `v4-${id}-`));
    await cp(join(staged.rootPath, "private/calibration/sets", set.id, set.version, id), stage2Root, { recursive: true });
    const observed = await evaluateTwoStageStructure({ stage_1_root: stage1Root, stage_2_root: stage2Root, semantic: expectedDocument.semantic, stage_1_snapshot: snapshot });
    await rm(stage2Root, { recursive: true, force: true });
    const observedLabels = Object.fromEntries(observed.checks.map(check => [check.id, check.state]));
    const passed = Object.entries(expectedDocument.expected).every(([key, value]) => observedLabels[key] === value) && observed.execution_health === "evaluated";
    results.push({ id, passed, observed: observedLabels, expected: expectedDocument.expected });
  }
} finally {
  await rm(staging, { recursive: true, force: true });
}
const document = { schema_version: "two-stage-offline-calibration/v1", candidate_model_calls: 0, judge_model_calls: 0, qualified: results.every(result => result.passed), calibration: results };
await Bun.write(join(candidate, "private/calibration/results.json"), `${JSON.stringify(document, null, 2)}\n`);
console.log(JSON.stringify({ qualified: document.qualified, candidate_model_calls: 0, judge_model_calls: 0, calibration: results }, null, 2));
process.exit(document.qualified ? 0 : 1);
