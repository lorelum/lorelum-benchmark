import { expect, test } from "bun:test";
import { runAsyncReportReplanAttempt } from "./run";
import { calibrationIdentity } from "./calibration";

test("Judge evidence and accounting stay blind and public-safe", async () => {
  const calibration = await calibrationIdentity();
  const run = await runAsyncReportReplanAttempt({
    blind_case_id: "blind-case-1",
    execution_health: "healthy",
    public_user_turns: [{ stage: "initial", text: "Start the report work." }, { stage: "post-constraint", text: "Reconsider the plan under the deployment constraint." }],
    events: [
      { type: "message_end", message: { role: "assistant", stage: "initial", content: [{ type: "text", text: "I will inspect the current assumptions." }] } },
      { type: "message_end", message: { role: "assistant", stage: "post-constraint", content: [{ type: "text", text: "I will revise the plan and report the remaining risk." }] } },
      { type: "tool_action", stage: "post-constraint", tool: "bash", args: { command: "bun test" }, status: "success", summary: "tests passed" },
    ],
    final_candidate_diff: "diff --git a/src/report.ts b/src/report.ts\n+export function report() {}\n",
  }, {
    calibration: { ...calibration, status: "qualified", calls: 9, medians: { reference: 80, equivalent: 78, "anti-pattern": 40 } },
    complete: async () => ({ output: { criteria: [
      { id: "assumption-invalidation", points: 15, rationale: "visible" }, { id: "plan-revision", points: 15, rationale: "visible" }, { id: "implementation-scope-adjustment", points: 20, rationale: "visible" }, { id: "verification-evidence-update", points: 15, rationale: "visible" }, { id: "risk-and-uncertainty-honesty", points: 10, rationale: "visible" },
    ], confidence: 80 } }),
  });
  const serialized = JSON.stringify({ evidence: run.evidence, result: run.result, accounting: run.accounting });
  for (const forbidden of ["condition_id", "delivery_node", "session_id", "practice_id", "pack_ref", "private/", "evaluator/", "oracle/", "System prompt", "developer prompt"]) expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase());
  expect(run.accounting.blind_case_id).toBe("blind-case-1");
  expect(run.accounting.provider.id).toBe("judge-agent/async-report-replan/v1");
});
