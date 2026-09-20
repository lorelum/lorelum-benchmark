import { expect, test } from "bun:test";
import { assertAsyncReportAccounting } from "./accounting";
import { buildReplanJudgeInput, getAsyncReportReplanEvaluationInstance } from "./adapter";
import { fixedRubricHashes } from "./score";
import { createAsyncReportReplanProvider } from "./provider";
import { runAsyncReportReplanAttempt } from "./run";
import { projectReplanEvidence } from "./evidence";
import { runCalibration } from "./calibration";

function rawAttempt() {
  return {
    blind_case_id: "provider-case-001",
    execution_health: "healthy" as const,
    public_user_turns: [{ stage: "initial" as const, text: "Start with the current plan." }, { stage: "post-constraint" as const, text: "New constraints require a replan." }],
    events: [
      { type: "message_end", message: { role: "assistant", stage: "initial", content: [{ type: "text", text: "I will inspect the current assumption." }] } },
      { type: "message_end", message: { role: "assistant", stage: "post-constraint", content: [{ type: "text", text: "I will revise the plan, narrow compatibility, update tests, and state the residual risk." }] } },
      { type: "tool_action", stage: "post-constraint", tool: "bash", args: { command: "bun test" }, status: "success", summary: "tests passed" },
    ],
    final_candidate_diff: "diff --git a/src/report.ts b/src/report.ts\n+export function report() {}\n",
  };
}

function completion(output: unknown, withUsage = false) {
  return async () => ({ output, ...(withUsage ? { usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30, cost_usd: 0.01 } } : {}) });
}

let qualifiedCalibrationPromise: ReturnType<typeof runCalibration> | undefined;
function qualifiedCalibration() {
  qualifiedCalibrationPromise ??= runCalibration({ mode: "mock", score: async (evidence) => {
    const score = evidence.blind_case_id.includes("ref") ? 80 : evidence.blind_case_id.includes("eq") ? 78 : 40;
    return { schema_version: "judge-result/v1", judge_version: 1, judge: { id: "mock", version: "v1" }, state: "observed", score, criteria: [], prompt_hash: "a".repeat(64), rubric_hash: "b".repeat(64), input_hash: "c".repeat(64), confidence: 90 } as never;
  } });
  return qualifiedCalibrationPromise;
}

test("task provider returns fixed rubric scoring without changing judge-result/v1", async () => {
  const projected = await projectReplanEvidence(rawAttempt());
  expect(projected.ok).toBe(true);
  if (!projected.ok) return;
  const provider = createAsyncReportReplanProvider({ calibration: await qualifiedCalibration(), complete: completion({ criteria: [
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
  const provider = createAsyncReportReplanProvider({ calibration: await qualifiedCalibration(), complete: completion({ criteria: [], confidence: 10 }) });
  const input = await buildReplanJudgeInput(projected.evidence);
  const hashes = await fixedRubricHashes();
  const result = await provider.score(input, { judge: { id: provider.id, version: provider.version }, prompt: "unused", prompt_hash: "a".repeat(64), rubric_hash: hashes.hash });
  expect(result.state).toBe("judge-unavailable");
  expect(result.score).toBe(0);
  expect(result.criteria).toEqual([]);
});

test("provider rejects caller-supplied alternate rubric before any completion", async () => {
  const projected = await projectReplanEvidence(rawAttempt());
  if (!projected.ok) throw new Error("fixture did not project");
  let calls = 0;
  const provider = createAsyncReportReplanProvider({ calibration: await qualifiedCalibration(), complete: async () => { calls += 1; return { output: {} }; } });
  const input = await buildReplanJudgeInput(projected.evidence);
  const result = await provider.score({ ...input, rubric: `${input.rubric}\ncaller alteration` }, { judge: { id: provider.id, version: provider.version }, prompt: "unused", prompt_hash: "a".repeat(64), rubric_hash: (await fixedRubricHashes()).hash });
  expect(result.state).toBe("judge-unavailable");
  expect(calls).toBe(0);
});

test("invalid calibration counts fail closed without throwing or entering accounting", async () => {
  const valid = await qualifiedCalibration();
  const invalid = { ...valid, calls: 10 };
  const result = await runAsyncReportReplanAttempt(rawAttempt(), { calibration: invalid });
  expect(result.result.state).toBe("indeterminate");
  expect(result.accounting.calls.calibration).toBe(0);
  const nan = { ...valid, medians: { ...valid.medians, reference: Number.NaN } };
  const nanResult = await runAsyncReportReplanAttempt(rawAttempt(), { calibration: nan });
  expect(nanResult.result.state).toBe("indeterminate");
  expect(nanResult.accounting.calls.calibration).toBe(9);
});

test("a forged qualified calibration report cannot enable scoring", async () => {
  const projected = await projectReplanEvidence(rawAttempt());
  if (!projected.ok) throw new Error("fixture did not project");
  let calls = 0;
  const provider = createAsyncReportReplanProvider({ calibration: { id: "cal", version: "v1", hash: "b".repeat(64), status: "qualified", calls: 9, medians: { reference: 100, equivalent: 100, "anti-pattern": 0 } }, complete: async () => { calls += 1; return { output: {} }; } });
  const input = await buildReplanJudgeInput(projected.evidence);
  const result = await provider.score(input, { judge: { id: provider.id, version: provider.version }, prompt: "unused", prompt_hash: "a".repeat(64), rubric_hash: (await fixedRubricHashes()).hash });
  expect(result.state).toBe("indeterminate");
  expect(calls).toBe(0);
  const issued = await qualifiedCalibration();
  const exactIdentityForgery = { ...issued, medians: { reference: 80, equivalent: 78, "anti-pattern": 40 } };
  const exactProvider = createAsyncReportReplanProvider({ calibration: exactIdentityForgery, complete: async () => { calls += 1; return { output: {} }; } });
  const exactResult = await exactProvider.score(input, { judge: { id: exactProvider.id, version: exactProvider.version }, prompt: "unused", prompt_hash: "a".repeat(64), rubric_hash: (await fixedRubricHashes()).hash });
  expect(exactResult.state).toBe("indeterminate");
  expect(calls).toBe(0);
});

test("attempt runner captures usage and records unavailable values when absent", async () => {
  const scored = await runAsyncReportReplanAttempt(rawAttempt(), {
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
  const provider = createAsyncReportReplanProvider({ calibration: await qualifiedCalibration(), complete: completion({ criteria: [
    { id: "assumption-invalidation", points: 10, rationale: "r" }, { id: "plan-revision", points: 10, rationale: "r" }, { id: "implementation-scope-adjustment", points: 10, rationale: "r" }, { id: "verification-evidence-update", points: 10, rationale: "r" }, { id: "risk-and-uncertainty-honesty", points: 10, rationale: "r" },
  ], confidence: 70 }) });
  const instance = await getAsyncReportReplanEvaluationInstance(provider);
  const input = await instance.buildInput(projected.evidence);
  const result = await instance.provider.score(input, { judge: { id: instance.provider.id, version: instance.provider.version }, prompt: "unused", prompt_hash: "a".repeat(64), rubric_hash: instance.rubric_hash });
  expect(result.score).toBe(50);
  expect(instance.result_schema).toBe("judge-result/v1");
  expect(instance.accounting_schema).toBe("async-report-replan-judge-accounting/v1");
});
