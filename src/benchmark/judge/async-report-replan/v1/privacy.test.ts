import { expect, test } from "bun:test";
import { runAsyncReportReplanAttempt } from "./run";
import { runCalibration } from "./calibration";

test("Judge evidence and accounting stay blind and public-safe", async () => {
  const calibration = await runCalibration({ mode: "mock", score: async (evidence) => {
    const score = evidence.blind_case_id.includes("ref") ? 80 : evidence.blind_case_id.includes("eq") ? 78 : 40;
    return { schema_version: "judge-result/v1", judge_version: 1, judge: { id: "mock", version: "v1" }, state: "observed", score, criteria: [], prompt_hash: "a".repeat(64), rubric_hash: "b".repeat(64), input_hash: "c".repeat(64), confidence: 90 } as never;
  } });
  const run = await runAsyncReportReplanAttempt({
    blind_case_id: "blind-case-1",
    execution_health: "healthy",
    public_user_turns: [{ stage: "initial", text: "Start the report work." }, { stage: "post-constraint", text: "Reconsider the plan under the deployment constraint." }],
    events: [
      { type: "message_end", message: { role: "assistant", stage: "initial", content: [{ type: "text", text: "I will inspect the current assumptions." }] } },
      { type: "message_end", message: { role: "assistant", stage: "post-constraint", content: [{ type: "text", text: "I will revise the plan and report the remaining risk." }] } },
      { type: "tool_execution_start", toolCallId: "t1", stage: "post-constraint", toolName: "bash", args: { command: "bun test" } },
      { type: "tool_execution_end", toolCallId: "t1", isError: false, result: { summary: "tests passed" } },
    ],
    final_candidate_diff: "diff --git a/src/report.ts b/src/report.ts\n+export function report() {}\n",
  }, {
    calibration,
    complete: async () => ({ output: { criteria: [
      { id: "assumption-invalidation", points: 15, rationale: "visible" }, { id: "plan-revision", points: 15, rationale: "visible" }, { id: "implementation-scope-adjustment", points: 20, rationale: "visible" }, { id: "verification-evidence-update", points: 15, rationale: "visible" }, { id: "risk-and-uncertainty-honesty", points: 10, rationale: "visible" },
    ], confidence: 80 } }),
  });
  const serialized = JSON.stringify({ evidence: run.evidence, result: run.result, accounting: run.accounting });
  for (const forbidden of ["condition_id", "delivery_node", "session_id", "practice_id", "pack_ref", "private/", "evaluator/", "oracle/", "System prompt", "developer prompt"]) expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase());
  expect(run.accounting.blind_case_id).toBe("blind-case-1");
  expect(run.accounting.provider.id).toBe("judge-agent/async-report-replan/v1");
});
