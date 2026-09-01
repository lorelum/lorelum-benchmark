import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "bun:test";
import { buildStagedSchedule, parseStagedDiagnosticPlan, stagedConditions, type StagedDiagnosticPlan } from "./staged-profile-diagnostic-plan";
import { runStagedDiagnosticAttempt, type StagedPiAdapter, type StagedSemanticAdapter } from "./staged-profile-diagnostic-runner";
import type { ResolvedTwoStageProfile } from "../../../../kernel/profiles/two-stage-injection-calibration/v1/types";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
async function temp(): Promise<string> { const path = await mkdtemp(join(tmpdir(), "staged-runner-")); roots.push(path); return path; }
const candidate = "llm-provider-gateway-v4";
const identity = { id: candidate, path: `incubator/practice-injection/${candidate}`, source_commit: "1".repeat(40), snapshot_id: "2".repeat(64), profile_input_hash: "3".repeat(64) };

test("staged plan builds a cyclic Latin square and fails closed on escape or imbalance", () => {
  const document: StagedDiagnosticPlan = { schema_version: "staged-profile-diagnostic-plan/v1", id: "v4-offline", schedule_seed: "stable", schedule_algorithm: "cyclic-latin-square/v1", dry_run: true, repetitions: 3, conditions: [...stagedConditions], candidates: [identity] };
  const plan = parseStagedDiagnosticPlan(document);
  const schedule = buildStagedSchedule(plan);
  expect(schedule.map((entry) => entry.condition)).toEqual(["baseline", "oracle-practice", "irrelevant-practice"]);
  expect(() => parseStagedDiagnosticPlan({ ...document, repetitions: 2 })).toThrow("positive multiple of 3");
  const otherSeed = buildStagedSchedule(parseStagedDiagnosticPlan({ ...document, schedule_seed: "rotation" }));
  expect(otherSeed.map((entry) => entry.condition)).not.toEqual(schedule.map((entry) => entry.condition));
  for (const seededSchedule of [schedule, otherSeed]) {
    expect(new Set(seededSchedule.map((entry) => entry.condition))).toEqual(new Set(stagedConditions));
  }
  const candidates = [
    identity,
    { ...identity, id: "candidate-b" },
    { ...identity, id: "candidate-c" },
  ];
  const balanced = buildStagedSchedule(parseStagedDiagnosticPlan({ ...document, schedule_seed: "rotation", candidates }));
  expect(balanced.filter((entry) => entry.block === 1).map((entry) => entry.condition).sort()).toEqual([...stagedConditions].sort());
  expect(() => parseStagedDiagnosticPlan({ ...document, candidates: [{ ...identity, path: "../outside" }] })).toThrow("escapes workspace");
});

async function candidateFixture(): Promise<string> {
  const root = await temp(); const candidatePath = join(root, "candidate");
  await mkdir(join(candidatePath, "public/starter/app/src"), { recursive: true });
  await mkdir(join(candidatePath, "public/stage-2"), { recursive: true });
  await writeFile(join(candidatePath, "public/task.md"), stage1Prompt);
  await writeFile(join(candidatePath, "public/stage-2/task.md"), stage2Prompt);
  await writeFile(join(candidatePath, "public/starter/app/package.json"), "{}\n");
  await writeFile(join(candidatePath, "public/starter/app/bun.lock"), "lock\n");
  await writeFile(join(candidatePath, "public/starter/app/src/first.ts"), "export const first = 1;\n");
  return candidatePath;
}
function profile(): ResolvedTwoStageProfile { return { conditions: {} as ResolvedTwoStageProfile["conditions"], practice_metadata: {} as ResolvedTwoStageProfile["practice_metadata"], decision_rule: {} as ResolvedTwoStageProfile["decision_rule"], execution: { schema_version: "two-stage-execution/v1", session: { mode: "same-workspace-same-pi-session", transcript_materialization: "forbidden", resume_failure: "execution-unhealthy" }, stage_1: { prompt_path: "public/task.md", max_duration_minutes: 15 }, stage_2: { prompt_path: "public/stage-2/task.md", max_duration_minutes: 15 }, snapshot: { root: "app", exclude: ["node_modules"], hash_algorithm: "sha256" }, dependencies: { immutable_inputs: ["package.json", "bun.lock"] }, saturation: { high_pass_rate: 0.8, conclusion: "saturated/no-discriminability" } }, profile_input_hash: identity.profile_input_hash }; }
const stage1Prompt = "Build a single-provider gateway with retry and billing.\n";
const stage2Prompt = "Add the second provider while preserving the public API and billing semantics.\n";
function adapters(mutate?: (stage: 1 | 2, app: string) => Promise<void>): { pi: StagedPiAdapter; semantics: StagedSemanticAdapter; resumed: unknown[] } {
  const resumed: unknown[] = [];
  return {
    resumed,
    pi: {
      start: async (invocation) => { await mutate?.(1, invocation.app); return { session_id: "same", transcript_path: join(invocation.session_dir, "session.json") }; },
      resume: async (invocation) => { if (!invocation.session_id) throw new Error("missing session"); await mutate?.(2, invocation.app); resumed.push(invocation); return { session_id: invocation.session_id, transcript_path: join(invocation.session_dir, "session.json") }; },
    },
    semantics: { evaluate: async () => "pass" },
  };
}

test("dry-run provisions both staged prompts without invoking model adapters", async () => {
  const candidatePath = await candidateFixture(); const workspace = await temp(); const artifacts = await temp();
  let calls = 0; const controlled = adapters(async () => { calls++; });
  const report = await runStagedDiagnosticAttempt({ candidate_path: candidatePath, workspace, artifacts, profile: profile(), stage_1_prompt: stage1Prompt, stage_2_prompt: stage2Prompt, dry_run: true, pi: controlled.pi, semantics: controlled.semantics });
  expect(report.execution_health).toBe("dry-run"); expect(calls).toBe(0);
  expect(await Bun.file(join(workspace, "task.md")).text()).toContain("Build a single-provider");
});

test("prompt text is bound to the declared public prompt paths", async () => {
  const candidatePath = await candidateFixture(); const workspace = await temp(); const artifacts = await temp();
  let modelCalls = 0; const controlled = adapters(async () => { modelCalls++; });
  const report = await runStagedDiagnosticAttempt({ candidate_path: candidatePath, workspace, artifacts, profile: profile(), stage_1_prompt: "different from declared prompt", stage_2_prompt: stage2Prompt, dry_run: true, pi: controlled.pi, semantics: controlled.semantics });
  expect(report.execution_health).toBe("execution-unhealthy");
  expect(report.termination).toBe("prompt-binding");
  expect(modelCalls).toBe(0);
});

test("passes when Stage 2 resumes the exact session and preserves dependencies", async () => {
  const candidatePath = await candidateFixture(); const workspace = await temp(); const artifacts = await temp();
  const controlled = adapters();
  const report = await runStagedDiagnosticAttempt({ candidate_path: candidatePath, workspace, artifacts, profile: profile(), stage_1_prompt: stage1Prompt, stage_2_prompt: stage2Prompt, dry_run: false, pi: controlled.pi, semantics: controlled.semantics });
  expect(controlled.resumed[0]).toMatchObject({ stage: 2, session_id: "same", workspace, prompt_path: "task.md" });
  expect(report.session_binding).toBe("same-session"); expect(report.stage_1_semantic).toBe("pass"); expect(report.execution_health).toBe("evaluated");
  expect(report.structure?.checks.some((entry) => entry.id === "diff-classifiability")).toBe(true);
});

test("Stage 1 semantic failure never enters Stage 2", async () => {
  const candidatePath = await candidateFixture(); const workspace = await temp(); const artifacts = await temp();
  const controlled = adapters(); let stage2Calls = 0; const resume = controlled.pi.resume; controlled.pi.resume = async (input) => { stage2Calls++; return resume(input); };
  const semantics: StagedSemanticAdapter = { evaluate: async (stage) => stage === 1 ? "fail" : "pass" };
  const report = await runStagedDiagnosticAttempt({ candidate_path: candidatePath, workspace, artifacts, profile: profile(), stage_1_prompt: stage1Prompt, stage_2_prompt: stage2Prompt, dry_run: false, pi: controlled.pi, semantics });
  expect(report.termination).toBe("stage-1-semantic"); expect(report.stage_2_semantic).toBe("not-run"); expect(stage2Calls).toBe(0);
});

test("resume failure and identity mismatch are execution unhealthy", async () => {
  const candidatePath = await candidateFixture(); const workspace = await temp(); const artifacts = await temp();
  const pi: StagedPiAdapter = { start: async () => ({ session_id: "same", transcript_path: "artifact" }), resume: async () => { throw new Error("offline resume unavailable"); } };
  const report = await runStagedDiagnosticAttempt({ candidate_path: candidatePath, workspace, artifacts, profile: profile(), stage_1_prompt: stage1Prompt, stage_2_prompt: stage2Prompt, dry_run: false, pi, semantics: { evaluate: async () => "pass" } });
  expect(report.execution_health).toBe("execution-unhealthy"); expect(report.termination).toBe("session-resume");
  const workspace2 = await temp(); const mismatch = adapters(); const start = mismatch.pi.start; mismatch.pi.start = async (input) => { const result = await start(input); mismatch.pi.resume = async () => ({ session_id: "different", transcript_path: "artifact" }); return result; };
  const report2 = await runStagedDiagnosticAttempt({ candidate_path: candidatePath, workspace: workspace2, artifacts, profile: profile(), stage_1_prompt: stage1Prompt, stage_2_prompt: stage2Prompt, dry_run: false, pi: mismatch.pi, semantics: mismatch.semantics });
  expect(report2.execution_health).toBe("execution-unhealthy"); expect(report2.termination).toBe("session-resume");
});

test("dependency mutation and snapshot mutation fail closed before Stage 2 observation", async () => {
  const candidatePath = await candidateFixture(); const workspace = await temp(); const artifacts = await temp();
  const dependency = adapters();
  dependency.semantics.evaluate = async (stage, app) => { if (stage === 1) await writeFile(join(app, "package.json"), '{"changed":true}\n'); return "pass"; };
  const dependencyReport = await runStagedDiagnosticAttempt({ candidate_path: candidatePath, workspace, artifacts, profile: profile(), stage_1_prompt: stage1Prompt, stage_2_prompt: stage2Prompt, dry_run: false, pi: dependency.pi, semantics: dependency.semantics });
  expect(dependencyReport.termination).toBe("dependency-mutation");
  const workspace2 = await temp(); const snapshot = adapters();
  snapshot.semantics.evaluate = async (stage, app) => { if (stage === 1) await writeFile(join(app, "src/late.ts"), "export const late = 1;\n"); return "pass"; };
  const snapshotReport = await runStagedDiagnosticAttempt({ candidate_path: candidatePath, workspace: workspace2, artifacts, profile: profile(), stage_1_prompt: stage1Prompt, stage_2_prompt: stage2Prompt, dry_run: false, pi: snapshot.pi, semantics: snapshot.semantics });
  expect(snapshotReport.termination).toBe("stage-1-snapshot-mismatch");
});
