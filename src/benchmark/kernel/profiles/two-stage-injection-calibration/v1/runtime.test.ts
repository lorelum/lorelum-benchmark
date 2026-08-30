import { mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { isGeneratedTwoStagePath, redactedTwoStageTrace, resolveTwoStageInjectionCalibration, resolveTwoStagePracticePayload } from "./runtime";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
async function write(path: string, body: string): Promise<void> { await mkdir(join(path, ".."), { recursive: true }); await writeFile(path, body); }
async function fixture(mutator?: (root: string) => Promise<void>): Promise<string> {
  const root = await mkdtempFixture();
  roots.push(root);
  const oracle = "Keep transport behind an adapter. Preserve policy and accounting boundaries.\n";
  const irrelevant = "Keep page metadata beside the collection. Preserve response boundaries.\n";
  const hashes = { oracle: createHash("sha256").update(oracle).digest("hex"), irrelevant: createHash("sha256").update(irrelevant).digest("hex") };
  await write(join(root, "private/practices/oracle.md"), oracle);
  await write(join(root, "private/practices/irrelevant.md"), irrelevant);
  await write(join(root, "private/practices/metadata.yaml"), `delivery_template: project-convention/v1
length_metric: project-convention/v1:utf8-rendered-characters
cards:
  - { id: oracle, version: v1, path: private/practices/oracle.md, rendered_characters: ${oracle.length}, target_path: docs/guide.md }
  - { id: irrelevant, version: v1, path: private/practices/irrelevant.md, rendered_characters: ${irrelevant.length}, target_path: docs/guide.md }
comparison: { maximum_relative_difference: 0.10, actual_relative_difference: ${(Math.abs(oracle.length - irrelevant.length) / Math.max(oracle.length, irrelevant.length)).toFixed(17)}, independently_reviewed: true }
`);
  await write(join(root, "private/execution/two-stage.yaml"), `schema_version: two-stage-execution/v1
session: { mode: same-workspace-same-pi-session, transcript_materialization: forbidden, resume_failure: execution-unhealthy }
stage_1: { prompt_path: public/task.md, max_duration_minutes: 15 }
stage_2: { prompt_path: public/stage-2/task.md, max_duration_minutes: 15 }
snapshot: { root: app, exclude: [node_modules], hash_algorithm: sha256 }
dependencies: { immutable_inputs: [package.json, bun.lock] }
saturation: { high_pass_rate: 0.8, conclusion: saturated/no-discriminability }
`);
  await write(join(root, "private/conditions.yaml"), `schema_version: two-stage-conditions/v1
shared_execution:
  agent: { id: local-pi, version: v2 }
  pi_version: 0.80.10
  model: { id: offline/null }
  additional_shared_system_prompt: none
  additional_shared_system_prompt_sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  tool_policy: private/execution/tool-policy.yaml
  tool_policy_sha256: ${"a".repeat(64)}
  workspace: clean-copy-per-attempt
  repetitions: 3
  budgets: { stage_1_max_duration_minutes: 15, stage_2_max_duration_minutes: 15, evaluator_time_counted: false }
  judge: none
conditions:
  - { id: baseline, status: declared, practice: none }
  - { id: oracle-practice, status: declared, practice: { path: private/practices/oracle.md, injection_channel: condition-scoped-private-runtime, sha256: ${hashes.oracle} } }
  - { id: irrelevant-practice, status: declared, practice: { path: private/practices/irrelevant.md, injection_channel: condition-scoped-private-runtime, sha256: ${hashes.irrelevant} } }
decision_rule: { metric: structure-pass-count, oracle_relation: strictly-greater-than-each-control, controls: [baseline, irrelevant-practice], directional_stability: majority-of-paired-blocks, otherwise: diagnostic-only }
`);
  await mutator?.(root);
  return root;
}
async function mkdtempFixture(): Promise<string> { return await import("node:fs/promises").then((fs) => fs.mkdtemp(join(tmpdir(), "two-stage-profile-"))); }
async function replace(root: string, file: string, from: string, to: string): Promise<void> {
  const path = join(root, file); const text = await Bun.file(path).text(); await Bun.write(path, text.replace(from, to));
}

test("resolves balanced project-convention Practice without exposing text", async () => {
  const root = await fixture();
  const profile = await resolveTwoStageInjectionCalibration(root);
  const oracle = await resolveTwoStagePracticePayload(root, profile, "oracle-practice");
  const baseline = await resolveTwoStagePracticePayload(root, profile, "baseline");
  const trace = redactedTwoStageTrace(profile, oracle);
  expect(profile.execution.session).toEqual({ mode: "same-workspace-same-pi-session", transcript_materialization: "forbidden", resume_failure: "execution-unhealthy" });
  expect(profile.execution.stage_1.max_duration_minutes).toBe(15); expect(profile.execution.stage_2.max_duration_minutes).toBe(15);
  expect(profile.execution.saturation).toEqual({ high_pass_rate: 0.8, conclusion: "saturated/no-discriminability" });
  expect(oracle.practice?.text).toContain("transport behind an adapter");
  expect(baseline.practice).toBeUndefined();
  expect(JSON.stringify(profile)).not.toContain("transport behind an adapter");
  expect(JSON.stringify(trace)).toEqual(expect.stringContaining("docs/guide.md"));
  expect(trace).not.toHaveProperty("practice_text");
});

test("rejects stale hash, stale length, escaping target, and changed session semantics", async () => {
  const cases: Array<[string, string, string, string]> = [
    ["practice hash", "private/practices/oracle.md", "Preserve", "Changed"],
    ["rendered characters", "private/practices/metadata.yaml", `rendered_characters: 72`, "rendered_characters: 71"],
    ["target path", "private/practices/metadata.yaml", "docs/guide.md", "../guide.md"],
    ["session failure", "private/execution/two-stage.yaml", "execution-unhealthy", "no-session"],
    ["saturation", "private/execution/two-stage.yaml", "high_pass_rate: 0.8", "high_pass_rate: 0.9"],
  ];
  for (const [label, file, from, to] of cases) {
    const root = await fixture(async (candidate) => { await replace(candidate, file, from, to); });
    await expect(resolveTwoStageInjectionCalibration(root)).rejects.toThrow();
  }
});

test("generated path helper excludes runner artifacts", () => {
  expect(isGeneratedTwoStagePath("app/node_modules/package/index.js")).toBe(true);
  expect(isGeneratedTwoStagePath("app/src/server.ts")).toBe(false);
});
