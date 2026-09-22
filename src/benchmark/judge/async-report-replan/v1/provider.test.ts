import { expect, test } from "bun:test";
import { assertAsyncReportAccounting } from "./accounting";
import { buildReplanJudgeInput, getAsyncReportReplanEvaluationInstance } from "./adapter";
import { fixedRubricHashes } from "./score";
import { buildAsyncReportJudgeInput, createAsyncReportReplanProvider, parseBridgeEvidence, scoreForCalibration } from "./provider";
import { runAsyncReportReplanAttempt } from "./run";
import { projectReplanEvidence } from "./evidence";
import { runCalibration } from "./calibration";
import { canonicalJson } from "./canonical";
import { sha256Text } from "../../../fs";

function rawAttempt(overrides: Record<string, unknown> = {}) {
  return {
    blind_case_id: "case-6f3a9c1d2e7b",
    execution_health: "healthy" as const,
    public_user_turns: [{ stage: "initial" as const, text: "Start with the current plan." }, { stage: "post-constraint" as const, text: "New constraints require a replan." }],
    events: [
      { type: "message_end", message: { role: "assistant", stage: "initial", content: [{ type: "text", text: "I will inspect the current assumption." }] } },
      { type: "message_end", message: { role: "assistant", stage: "post-constraint", content: [{ type: "text", text: "I will revise the plan, narrow compatibility, update tests, and state the residual risk." }] } },
      { type: "tool_execution_start", toolCallId: "t1", stage: "post-constraint", toolName: "bash", args: { command: "bun test" } },
      { type: "tool_execution_end", toolCallId: "t1", isError: false, result: { summary: "tests passed" } },
    ],
    final_candidate_diff: "diff --git a/src/report.ts b/src/report.ts\n+export function report() {}\n",
    ...overrides,
  };
}

function completion(output: unknown, withUsage = false) {
  return async () => ({ output, ...(withUsage ? { usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30, cost_usd: 0.01 } } : {}) });
}

let qualifiedCalibrationPromise: ReturnType<typeof runCalibration> | undefined;
function qualifiedCalibration() {
  qualifiedCalibrationPromise ??= runCalibration({ mode: "mock", score: async (evidence) => {
    const score = evidence.blind_case_id === "case-q3m1x9p2k4r8" ? 80 : evidence.blind_case_id === "case-m4n8v2c6z1p7" ? 78 : 40;
    return { schema_version: "judge-result/v1", judge_version: 1, judge: { id: "mock", version: "v1" }, state: "observed", score, criteria: [], prompt_hash: "a".repeat(64), rubric_hash: "b".repeat(64), input_hash: "c".repeat(64), confidence: 90 } as never;
  } });
  return qualifiedCalibrationPromise;
}

test("task provider returns fixed rubric scoring without changing judge-result/v1", async () => {
  const projected = await projectReplanEvidence(rawAttempt());
  expect(projected.ok).toBe(true);
  if (!projected.ok) return;
  const provider = createAsyncReportReplanProvider({ mode: "mock", calibration: await qualifiedCalibration(), complete: completion({ criteria: [
    { id: "assumption-invalidation", points: 16, rationale: "post-constraint text names the invalidated assumption" },
    { id: "plan-revision", points: 15, rationale: "post-constraint plan changes sequence" },
    { id: "implementation-scope-adjustment", points: 20, rationale: "compatibility scope is narrowed" },
    { id: "verification-evidence-update", points: 14, rationale: "tests are rerun" },
    { id: "risk-and-uncertainty-honesty", points: 12, rationale: "residual risk is stated" },
  ], confidence: 88 }) });
  const input = await buildReplanJudgeInput(projected.evidence);
  const hashes = await fixedRubricHashes();
  const result = await provider.score(input, { judge: { id: provider.id, version: provider.version }, prompt: "unused", prompt_hash: "a".repeat(64), rubric_hash: hashes.hash });
  expect(result.state).toBe("observed");
  expect(result.score).toBe(77);
  expect(result.criteria.map((criterion) => criterion.id)).toEqual(["assumption-invalidation", "plan-revision", "implementation-scope-adjustment", "verification-evidence-update", "risk-and-uncertainty-honesty"]);
  expect(result.schema_version).toBe("judge-result/v1");
});

test("invalid structured output becomes judge-unavailable instead of a low score", async () => {
  const projected = await projectReplanEvidence(rawAttempt());
  if (!projected.ok) throw new Error("fixture did not project");
  const provider = createAsyncReportReplanProvider({ mode: "mock", calibration: await qualifiedCalibration(), complete: completion({ criteria: [], confidence: 10 }) });
  const input = await buildReplanJudgeInput(projected.evidence);
  const hashes = await fixedRubricHashes();
  const result = await provider.score(input, { judge: { id: provider.id, version: provider.version }, prompt: "unused", prompt_hash: "a".repeat(64), rubric_hash: hashes.hash });
  expect(result.state).toBe("judge-unavailable");
  expect(result.score).toBe(0);
  expect(result.criteria).toEqual([]);
});

test("injected completion requires explicit mock mode", async () => {
  const projected = await projectReplanEvidence(rawAttempt());
  if (!projected.ok) throw new Error("fixture did not project");
  let calls = 0;
  const provider = createAsyncReportReplanProvider({ calibration: await qualifiedCalibration(), complete: async () => { calls += 1; return { output: {} }; } });
  const result = await provider.score(await buildReplanJudgeInput(projected.evidence), { judge: { id: provider.id, version: provider.version }, prompt: "unused", prompt_hash: "a".repeat(64), rubric_hash: (await fixedRubricHashes()).hash });
  expect(result.state).toBe("not-run");
  expect(calls).toBe(0);
});

test("explicit mock mode without a completion never constructs a real caller", async () => {
  let calls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => { calls += 1; throw new Error("mock mode must not fetch"); }) as typeof fetch;
  try {
    const provider = createAsyncReportReplanProvider({ mode: "mock", env: { LORELUM_JUDGE_REAL: "1", LORELUM_JUDGE_BASE_URL: "https://judge.invalid", LORELUM_JUDGE_API_KEY: "secret", LORELUM_JUDGE_MODEL: "model" } });
    const result = await provider.score({ task_md: "x", candidate_diff: "x", rubric: "x", input_hash: "a".repeat(64), material: [] }, { judge: { id: provider.id, version: provider.version }, prompt: "x", prompt_hash: "a".repeat(64), rubric_hash: "b".repeat(64) });
    expect(result.state).toBe("not-run");
  } finally {
    globalThis.fetch = originalFetch;
  }
  expect(calls).toBe(0);
});

test("provider rejects caller-supplied alternate rubric before any completion", async () => {
  const projected = await projectReplanEvidence(rawAttempt());
  if (!projected.ok) throw new Error("fixture did not project");
  let calls = 0;
  const provider = createAsyncReportReplanProvider({ mode: "mock", calibration: await qualifiedCalibration(), complete: async () => { calls += 1; return { output: {} }; } });
  const input = await buildReplanJudgeInput(projected.evidence);
  const result = await provider.score({ ...input, rubric: `${input.rubric}\ncaller alteration` }, { judge: { id: provider.id, version: provider.version }, prompt: "unused", prompt_hash: "a".repeat(64), rubric_hash: (await fixedRubricHashes()).hash });
  expect(result.state).toBe("judge-unavailable");
  expect(calls).toBe(0);
});

test("calibration scoring requires a runner-issued capability", async () => {
  const projected = await projectReplanEvidence(rawAttempt());
  if (!projected.ok) throw new Error("fixture did not project");
  const input = await buildReplanJudgeInput(projected.evidence);
  await expect(scoreForCalibration(input, { judge: { id: "judge-agent/async-report-replan/v1", version: "v1" }, rubric_hash: (await fixedRubricHashes()).hash, input_hash: input.input_hash }, async () => ({ output: {} }), {})).rejects.toThrow("runner-issued capability");
});

test("issued evidence and input reject post-issuance content changes", async () => {
  const projected = await projectReplanEvidence(rawAttempt());
  if (!projected.ok) throw new Error("fixture did not project");
  const evidence = projected.evidence;
  evidence.final_candidate_diff += "+changed after issuance\n";
  evidence.final_candidate_diff_sha256 = await sha256Text(evidence.final_candidate_diff);
  const { evidence_hash: _ignored, ...withoutHash } = evidence;
  evidence.evidence_hash = await sha256Text(canonicalJson(withoutHash));
  await expect(buildAsyncReportJudgeInput(evidence)).rejects.toThrow("modified after issuance");

  const fresh = await projectReplanEvidence(rawAttempt());
  if (!fresh.ok) throw new Error("fixture did not project");
  const input = await buildAsyncReportJudgeInput(fresh.evidence);
  input.candidate_diff = input.candidate_diff.replace("report()", "changedReport()");
  input.input_hash = await sha256Text("caller-rehashed-input");
  await expect(parseBridgeEvidence(input)).rejects.toThrow("modified after issuance");
});

test("provider rejects unissued evidence and alternate Judge identities", async () => {
  const projected = await projectReplanEvidence(rawAttempt());
  if (!projected.ok) throw new Error("fixture did not project");
  const provider = createAsyncReportReplanProvider({ mode: "mock", calibration: await qualifiedCalibration(), complete: completion({ criteria: [], confidence: 10 }) });
  await expect(buildReplanJudgeInput(structuredClone(projected.evidence))).rejects.toThrow("not issued by the projector");
  const input = await buildReplanJudgeInput(projected.evidence);
  const hashes = await fixedRubricHashes();
  const result = await provider.score(input, { judge: { id: "other-provider", version: "v1" }, prompt: "unused", prompt_hash: "a".repeat(64), rubric_hash: hashes.hash });
  expect(result.state).toBe("judge-unavailable");
  expect(result.judge).toEqual({ id: provider.id, version: provider.version });
});

test("invalid calibration counts fail closed without throwing or entering accounting", async () => {
  const valid = await qualifiedCalibration();
  const invalid = { ...valid, calls: 10 };
  const result = await runAsyncReportReplanAttempt(rawAttempt(), { mode: "mock", calibration: invalid, complete: async () => { throw new Error("must not score"); } });
  expect(result.result.state).toBe("indeterminate");
  expect(result.accounting.calls.calibration).toBe(0);
  const nan = { ...valid, medians: { ...valid.medians, reference: Number.NaN } };
  const nanResult = await runAsyncReportReplanAttempt(rawAttempt(), { mode: "mock", calibration: nan, complete: async () => { throw new Error("must not score"); } });
  expect(nanResult.result.state).toBe("indeterminate");
  expect(nanResult.accounting.calls.calibration).toBe(9);
});

test("a forged qualified calibration report cannot enable scoring", async () => {
  const projected = await projectReplanEvidence(rawAttempt());
  if (!projected.ok) throw new Error("fixture did not project");
  let calls = 0;
  const provider = createAsyncReportReplanProvider({ mode: "mock", calibration: { id: "cal", version: "v1", hash: "b".repeat(64), status: "qualified", calls: 9, medians: { reference: 100, equivalent: 100, "anti-pattern": 0 } } as never, complete: async () => { calls += 1; return { output: {} }; } });
  const input = await buildReplanJudgeInput(projected.evidence);
  const result = await provider.score(input, { judge: { id: provider.id, version: provider.version }, prompt: "unused", prompt_hash: "a".repeat(64), rubric_hash: (await fixedRubricHashes()).hash });
  expect(result.state).toBe("indeterminate");
  expect(calls).toBe(0);
  const issued = await qualifiedCalibration();
  const exactIdentityForgery = { ...issued, medians: { reference: 81, equivalent: 79, "anti-pattern": 39 } };
  const exactProvider = createAsyncReportReplanProvider({ mode: "mock", calibration: exactIdentityForgery, complete: async () => { calls += 1; return { output: {} }; } });
  const exactResult = await exactProvider.score(input, { judge: { id: exactProvider.id, version: exactProvider.version }, prompt: "unused", prompt_hash: "a".repeat(64), rubric_hash: (await fixedRubricHashes()).hash });
  expect(["indeterminate", "judge-unavailable"]).toContain(exactResult.state);
  expect(calls).toBe(0);
});

test("attempt runner captures usage and records unavailable values when absent", async () => {
  const scored = await runAsyncReportReplanAttempt(rawAttempt(), {
    mode: "mock",
    complete: completion({ criteria: [
      { id: "assumption-invalidation", points: 20, rationale: "r" }, { id: "plan-revision", points: 20, rationale: "r" }, { id: "implementation-scope-adjustment", points: 25, rationale: "r" }, { id: "verification-evidence-update", points: 20, rationale: "r" }, { id: "risk-and-uncertainty-honesty", points: 15, rationale: "r" },
    ], confidence: 90 }, true),
    calibration: await qualifiedCalibration(),
  });
  expect(scored.result.state).toBe("observed");
  expect(scored.accounting.calls.scoring).toBe(1);
  expect(scored.accounting.usage.total_tokens).toBe(30);
  assertAsyncReportAccounting(scored.accounting);

  const noUsage = await runAsyncReportReplanAttempt(rawAttempt(), {
    mode: "mock",
    complete: completion({ criteria: [
      { id: "assumption-invalidation", points: 20, rationale: "r" }, { id: "plan-revision", points: 20, rationale: "r" }, { id: "implementation-scope-adjustment", points: 25, rationale: "r" }, { id: "verification-evidence-update", points: 20, rationale: "r" }, { id: "risk-and-uncertainty-honesty", points: 15, rationale: "r" },
    ], confidence: 90 }),
    calibration: await qualifiedCalibration(),
  });
  expect(noUsage.accounting.usage.input_tokens).toBe("unavailable");
});

test("missing real opt-in is not-run and raw evidence cannot reach the provider", async () => {
  const notRun = await runAsyncReportReplanAttempt(rawAttempt(), { calibration: await qualifiedCalibration() });
  expect(notRun.result.state).toBe("not-run");
  const instance = await getAsyncReportReplanEvaluationInstance();
  expect(instance.plan.method).toBe("llm-subjective");
  const rejected = await instance.provider.score({ task_md: "x", candidate_diff: JSON.stringify({ session_id: "bad" }), rubric: "x", input_hash: "a".repeat(64), material: [] }, { judge: { id: instance.provider.id, version: instance.provider.version }, prompt: "x", prompt_hash: "a".repeat(64), rubric_hash: "b".repeat(64) });
  expect(rejected.state).toBe("not-run");
});

test("invalid blind identity returns an auditable indeterminate sidecar", async () => {
  const result = await runAsyncReportReplanAttempt(rawAttempt({ blind_case_id: "reference" }), { mode: "mock", calibration: await qualifiedCalibration(), complete: async () => ({ output: {} }) });
  expect(result.result.state).toBe("indeterminate");
  expect(result.accounting.blind_case_id).toBe("case-000000000000");
  expect(() => assertAsyncReportAccounting(result.accounting)).not.toThrow();
});

test("diagnostic provider states use fixed provenance instead of caller-supplied hashes", async () => {
  const instance = await getAsyncReportReplanEvaluationInstance();
  const callerHash = "a".repeat(64);
  const result = await instance.provider.score({ task_md: "x", candidate_diff: "x", rubric: "x", input_hash: callerHash, material: [] }, { judge: { id: instance.provider.id, version: instance.provider.version }, prompt: "x", prompt_hash: callerHash, rubric_hash: callerHash });
  expect(result.state).toBe("not-run");
  expect(result.prompt_hash).not.toBe(callerHash);
  expect(result.rubric_hash).not.toBe(callerHash);
  expect(result.input_hash).not.toBe(callerHash);
});

test("real configuration gaps are judge-unavailable without a provider call", async () => {
  const result = await runAsyncReportReplanAttempt(rawAttempt(), { env: { LORELUM_JUDGE_REAL: "1" }, calibration: await qualifiedCalibration() });
  expect(result.result.state).toBe("judge-unavailable");
  expect(result.accounting.calls.scoring).toBe(0);
});

test("adapter material is checked by the existing public-only Judge allowlist", async () => {
  const projected = await projectReplanEvidence(rawAttempt());
  if (!projected.ok) throw new Error("fixture did not project");
  const input = await (await import("./adapter")).buildReplanJudgeInput(projected.evidence, [{ path: "suites/react-skill-comparison/tasks/workspace-overview-loader/v1/public/task.md", kind: "public/task.md" }]);
  expect(input.material).toHaveLength(1);
  await expect((await import("./adapter")).buildReplanJudgeInput(projected.evidence, [{ path: "private/task.md", kind: "declared-public" }])).rejects.toThrow("judge input rejected");
});

test("a future adapter can invoke the fixed instance without changing scoring semantics", async () => {
  const projected = await projectReplanEvidence(rawAttempt());
  if (!projected.ok) throw new Error("fixture did not project");
  const provider = createAsyncReportReplanProvider({ mode: "mock", calibration: await qualifiedCalibration(), complete: completion({ criteria: [
    { id: "assumption-invalidation", points: 10, rationale: "r" }, { id: "plan-revision", points: 10, rationale: "r" }, { id: "implementation-scope-adjustment", points: 10, rationale: "r" }, { id: "verification-evidence-update", points: 10, rationale: "r" }, { id: "risk-and-uncertainty-honesty", points: 10, rationale: "r" },
  ], confidence: 70 }) });
  const instance = await getAsyncReportReplanEvaluationInstance(provider);
  const input = await instance.buildInput(projected.evidence);
  const result = await instance.provider.score(input, { judge: { id: instance.provider.id, version: instance.provider.version }, prompt: "unused", prompt_hash: "a".repeat(64), rubric_hash: instance.rubric_hash });
  expect(result.score).toBe(50);
  expect(instance.result_schema).toBe("judge-result/v1");
  expect(instance.accounting_schema).toBe("async-report-replan-judge-accounting/v1");
});
