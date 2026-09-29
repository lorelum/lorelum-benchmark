import { expect, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020";
import { isAbsolute, join, relative } from "node:path";
import { workspaceRoot } from "../../../../fs";
import { evaluateCalibrationMedians as evaluateFrozenCalibrationMedians, loadCalibrationFixtures, runCalibration } from "../../../../judge/async-report-replan/v1/calibration";
import { createCachedReportDiagnostics, runRealCalibrationWithDiagnostics, runAsyncReportReplanAttemptWithDiagnostics, evaluateCalibrationGateChecks, renderJudgeCalibrationDiagnosticsMarkdown } from "./timing-pilot-judge-diagnostics";
import type { JudgeCompletionWithUsage } from "../../../../judge/async-report-replan/v1/types";

const schemaPath = join(workspaceRoot, "schemas/async-report-timing-pilot-judge-calibration-diagnostics-v1.schema.json");
const gateThresholds = { reference_min: 75, equivalent_max_difference: 10, anti_pattern_max: 60, reference_min_difference: 15 };

function criteriaFor(score: number) {
  const dimensions = [
    ["assumption-invalidation", 20],
    ["plan-revision", 20],
    ["implementation-scope-adjustment", 25],
    ["verification-evidence-update", 20],
    ["risk-and-uncertainty-honesty", 15],
  ] as const;
  let remaining = score;
  return dimensions.map(([id, maximum]) => {
    const points = Math.min(remaining, maximum);
    remaining -= points;
    return { id, points, rationale: `Visible evidence supports ${id}.` };
  });
}

function rawAttempt() {
  return {
    blind_case_id: "case-a1b2c3d4e5f6",
    execution_health: "healthy",
    public_user_turns: [
      { stage: "initial", text: "Implement the report path." },
      { stage: "post-constraint", text: "The deployment constraint changed; replan." },
    ],
    events: [
      { type: "message_end", message: { role: "assistant", stage: "initial", content: [{ type: "text", text: "I will inspect the report path." }] } },
      { type: "message_end", message: { role: "assistant", stage: "post-constraint", content: [{ type: "text", text: "The constraint invalidates my assumption. I will revise implementation and checks." }] } },
      { type: "tool_execution_start", toolCallId: "t1", stage: "post-constraint", toolName: "bash", args: { command: "bun test" } },
      { type: "tool_execution_end", toolCallId: "t1", isError: false, result: { summary: "4 tests passed" } },
    ],
    final_candidate_diff: "diff --git a/src/report.ts b/src/report.ts\n+export function report() {}\n",
  };
}

async function qualifiedMockCalibration() {
  const fixtures = await loadCalibrationFixtures();
  const groupByCaseId = new Map(fixtures.map((fixture) => [fixture.evidence.blind_case_id, fixture.id]));
  return runCalibration({
    mode: "mock",
    score: async (evidence) => {
      const group = groupByCaseId.get(evidence.blind_case_id);
      const score = group === "reference" ? 80 : group === "equivalent" ? 78 : 40;
      return { schema_version: "judge-result/v1", judge_version: 1, judge: { id: "mock", version: "v1" }, state: "observed", score, criteria: [], prompt_hash: "a".repeat(64), rubric_hash: "b".repeat(64), input_hash: "c".repeat(64), confidence: 90 } as never;
    },
  });
}

test("calibration diagnostics enumerate every failed gate and stay equivalent to the frozen qualification decision", async () => {
  for (const medians of [
    { reference: 80, equivalent: 78, "anti-pattern": 40 },
    { reference: 57, equivalent: 42, "anti-pattern": 0 },
    { reference: 80, equivalent: 50, "anti-pattern": 70 },
  ]) {
    const frozen = await evaluateFrozenCalibrationMedians(medians, gateThresholds);
    const checks = evaluateCalibrationGateChecks(medians, gateThresholds);
    expect(checks.every((check) => check.status === "passed")).toBe(frozen.qualified);
    if (!frozen.qualified) expect(checks.some((check) => check.status === "failed")).toBe(true);
  }
  const checks = evaluateCalibrationGateChecks({ reference: 57, equivalent: 42, "anti-pattern": 0 }, gateThresholds);
  expect(checks).toEqual([
    { id: "reference_minimum", observed: 57, operator: ">=", threshold: 75, status: "failed" },
    { id: "equivalent_distance", observed: 15, operator: "<=", threshold: 10, status: "failed" },
    { id: "anti_pattern_maximum", observed: 0, operator: "<=", threshold: 60, status: "passed" },
    { id: "reference_separation", observed: 57, operator: ">=", threshold: 15, status: "passed" },
  ]);
});

test("real calibration adapter captures private per-call criteria without exposing labels to the Judge", async () => {
  const fixtures = await loadCalibrationFixtures();
  const groupByCaseId = new Map(fixtures.map((fixture) => [fixture.evidence.blind_case_id, fixture.id]));
  const prompts: string[] = [];
  const completion: JudgeCompletionWithUsage = async (system, user) => {
    prompts.push(`${system}\n${user}`);
    const group = fixtures.find((fixture) => user.includes(fixture.evidence.blind_case_id))?.id;
    const score = group === "reference" ? 80 : group === "equivalent" ? 78 : 40;
    const criteria = criteriaFor(score);
    criteria[0]!.rationale = "Visible evidence is relevant; https://gateway.invalid/path?token=response-secret";
    return { output: { criteria, confidence: 91 }, usage: { input_tokens: 100, output_tokens: 40, total_tokens: 140, cost_usd: 0.001 } };
  };
  const { report, diagnostics } = await runRealCalibrationWithDiagnostics({
    env: { LORELUM_JUDGE_REAL: "1", LORELUM_JUDGE_MODEL: "diagnostic-test-model", LORELUM_JUDGE_CALIBRATION_KEY: "test-only-attestation-key" },
    complete: completion,
  });
  expect(report).toMatchObject({ status: "qualified", calls: 9, medians: { reference: 80, equivalent: 78, "anti-pattern": 40 } });
  expect(diagnostics).toMatchObject({ status: "captured", contract_snapshot_verified: true, calibration: { status: "qualified", calls: 9 } });
  expect(diagnostics.observations).toHaveLength(9);
  expect(diagnostics.observations.every((call) => call.status === "observed" && call.criteria.length === 5 && call.prompt_hash && call.input_hash)).toBe(true);
  expect(JSON.stringify(diagnostics)).not.toContain("gateway.invalid");
  expect(JSON.stringify(diagnostics)).not.toContain("response-secret");
  expect(diagnostics.observations.filter((call) => call.fixture_group === "reference")).toHaveLength(3);
  expect(diagnostics.gate_checks.every((check) => check.status === "passed")).toBe(true);
  expect(prompts).toHaveLength(9);
  expect(prompts.join("\n")).not.toMatch(/\b(?:reference|equivalent|anti-pattern)\b/i);
  expect(groupByCaseId.size).toBe(3);
  const markdown = renderJudgeCalibrationDiagnosticsMarkdown(diagnostics);
  expect(markdown).toContain("Individual Judge calls");
  expect(markdown).toContain("Visible evidence supports");
  const schema = await Bun.file(schemaPath).json();
  const validate = new Ajv2020({ allErrors: true }).compile(schema);
  expect(validate(diagnostics)).toBe(true);
});

test("calibration request failures keep only a safe category and HTTP status", async () => {
  const secret = "Bearer top-secret-value";
  const { report, diagnostics } = await runRealCalibrationWithDiagnostics({
    env: { LORELUM_JUDGE_REAL: "1", LORELUM_JUDGE_MODEL: "diagnostic-test-model", LORELUM_JUDGE_CALIBRATION_KEY: "test-only-attestation-key" },
    complete: async () => { throw new Error(`HTTP 503 https://gateway.invalid/chat?token=${secret}`); },
  });
  expect(report.status).toBe("diagnostic");
  expect(diagnostics.observations).toHaveLength(1);
  expect(diagnostics.observations[0]).toMatchObject({ status: "unavailable", failure: { code: "http_error", http_status: 503 } });
  expect(JSON.stringify(diagnostics)).not.toContain(secret);
  const schema = await Bun.file(schemaPath).json();
  const validate = new Ajv2020({ allErrors: true }).compile(schema);
  expect(validate(diagnostics)).toBe(true);
});

test("attempt scoring retains a safe request failure even when the frozen Judge returns a generic unavailable state", async () => {
  const calibration = await qualifiedMockCalibration();
  const secret = "Bearer scoring-secret";
  const result = await runAsyncReportReplanAttemptWithDiagnostics(rawAttempt(), {
    mode: "mock",
    calibration,
    complete: async () => { throw new Error(`HTTP 502 https://gateway.invalid/?token=${secret}`); },
  });
  expect(result.result.state).toBe("judge-unavailable");
  expect(result.diagnostics).toMatchObject({ call_attempted: true, failure: { stage: "request", code: "http_error", http_status: 502 } });
  expect(result.accounting.failure_reason).toBe("request/http_error (HTTP 502)");
  expect(JSON.stringify(result)).not.toContain(secret);
});


test("preflight summary links private diagnostics without exposing their labels or rationales", async () => {
  const { runTimingPilotPreflight, writeTimingPilotPreflightSummary } = await import("./async-report-timing-pilot");
  const root = workspaceRoot;
  const scratchPath = join(root, "scratch", `judge-diagnostics-writer-test-${Date.now()}`);
  const expectedRoot = join(root, "scratch");
  const scratchRelative = relative(expectedRoot, scratchPath);
  if (!scratchRelative || scratchRelative === ".." || scratchRelative.startsWith("..") || isAbsolute(scratchRelative)) throw new Error("test output escaped scratch root");
  try {
    const summary = await runTimingPilotPreflight({ root, plan_path: "missing-plan-for-no-model-test.yaml" });
    const diagnostics = {
      schema_version: "async-report-timing-pilot-judge-calibration-diagnostics/v1" as const,
      status: "captured" as const,
      calibration: {
        id: "async-report-replan-judge-calibration", version: "v1", hash: "a".repeat(64),
        status: "diagnostic" as const, model: "test-model", calls: 1, duration_ms: 12,
        usage: { input_tokens: 5, output_tokens: 3, total_tokens: 8, cost_usd: "unavailable" as const },
        medians: { reference: 57 }, report_reason: "reference median is below the minimum",
      },
      contract_snapshot_verified: true,
      thresholds: { reference_min: 75, equivalent_max_difference: 10, anti_pattern_max: 60, reference_min_difference: 15 },
      gate_checks: [{ id: "reference_minimum" as const, observed: 57, operator: ">=" as const, threshold: 75, status: "failed" as const }],
      observations: [{
        call_index: 1, fixture_group: "reference" as const, opaque_case_id: "case-a1b2c3d4e5f6", repetition: 1,
        status: "observed" as const, score: 57, confidence: 90,
        criteria: [{ id: "plan-revision", points: 10, max_points: 20, rationale: "PRIVATE_RATIONALE_SENTINEL: evidence did not show concrete sequencing." }],
        prompt_hash: "b".repeat(64), input_hash: "c".repeat(64), duration_ms: 12,
        usage: { input_tokens: 5, output_tokens: 3, total_tokens: 8, cost_usd: "unavailable" as const },
      }],
    };
    const paths = await writeTimingPilotPreflightSummary(summary, scratchPath, root, diagnostics);
    expect(paths.judge_calibration_diagnostics_markdown_path).toBeDefined();
    const publicText = `${await Bun.file(paths.markdown_path).text()}\n${await Bun.file(paths.json_path).text()}`;
    expect(publicText).toContain("private/judge-calibration-diagnostics.md");
    expect(publicText).not.toContain("PRIVATE_RATIONALE_SENTINEL");
    expect(publicText).not.toMatch(/reference|equivalent|anti-pattern/i);
    const privateText = await Bun.file(paths.judge_calibration_diagnostics_markdown_path!).text();
    expect(privateText).toContain("PRIVATE_RATIONALE_SENTINEL");
    expect(privateText).toContain("Reference-group minimum score");
  } finally {
    const resolvedRelative = relative(expectedRoot, scratchPath);
    if (!resolvedRelative || resolvedRelative === ".." || resolvedRelative.startsWith("..") || isAbsolute(resolvedRelative)) throw new Error("refusing to clean a path outside scratch");
    await import("node:fs/promises").then(({ rm }) => rm(scratchPath, { recursive: true, force: true }));
  }
});



test("cached calibration reports are explicitly marked as aggregate-only, with no invented per-call details", async () => {
  const report = await qualifiedMockCalibration();
  const diagnostics = createCachedReportDiagnostics(report);
  expect(diagnostics).toMatchObject({ status: "details_unavailable", reason: "cached_report_without_sidecar", contract_snapshot_verified: null, thresholds: null, observations: [] });
  expect(renderJudgeCalibrationDiagnosticsMarkdown(diagnostics)).toContain("No per-call scoring details were captured.");
  const schema = await Bun.file(schemaPath).json();
  expect(new Ajv2020({ allErrors: true }).compile(schema)(diagnostics)).toBe(true);
});

test("malformed Judge output is identified without retaining the raw response", async () => {
  const calibration = await qualifiedMockCalibration();
  const secret = "untrusted-full-response-sentinel";
  const result = await runAsyncReportReplanAttemptWithDiagnostics(rawAttempt(), {
    mode: "mock",
    calibration,
    complete: async () => ({ output: { malformed: secret } }),
  });
  expect(result.result.state).toBe("judge-unavailable");
  expect(result.diagnostics.failure).toMatchObject({ stage: "response", code: "invalid_structured_output" });
  expect(result.accounting.failure_reason).toBe("response/invalid_structured_output");
  expect(JSON.stringify(result)).not.toContain(secret);
});
