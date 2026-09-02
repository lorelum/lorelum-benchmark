import { expect, test } from "bun:test";
import { interpretDirectionalScreen, screenConditions } from "./directional-screen-interpretation";
import type { StagedAttemptReport } from "./staged-profile-diagnostic-runner";

type Attempt = Partial<StagedAttemptReport> & { condition_id: StagedAttemptReport["condition_id"]; block: number };

function attempt(input: Attempt, pass: boolean | "unhealthy" | "semantic-fail" | "indeterminate"): StagedAttemptReport & { block: number } {
  const evaluated = pass !== "unhealthy";
  const base: StagedAttemptReport = {
    schema_version: "staged-runner-attempt/v1",
    condition_id: input.condition_id,
    execution_health: evaluated ? "evaluated" : "execution-unhealthy",
    stage_1_semantic: pass === "semantic-fail" ? "fail" : evaluated ? "pass" : "not-run",
    stage_2_semantic: pass === "semantic-fail" ? "fail" : evaluated ? "pass" : "not-run",
    session_binding: evaluated ? "same-session" : "not-started",
    planned_denominator: 1,
  };
  const structure = evaluated
    ? {
        schema_version: "two-stage-structure-result/v1" as const,
        execution_health: "evaluated" as const,
        // Raw metrics exist on every evaluated attempt; the interpretation must ignore them.
        checks: pass === "indeterminate" ? [{ id: "diff-classifiability" as const, state: "indeterminate" as const, reason: "ambiguous" }] : [{ id: "handler-stability" as const, state: pass === true ? ("pass" as const) : ("fail" as const), reason: "" }],
        metrics: { changed_production_files: 9, changed_declarations: 9, handler_changed_declarations: 9, policy_changed_declarations: 9, ledger_changed_declarations: 9, transport_changed_declarations: 9, deleted_stage_1_declarations: 9, replaced_stage_1_declarations: 9, normalized_changed_ast_nodes: 999, maximum_single_file_edit_share: 0.99 },
        structure_pass: pass === true,
      }
    : undefined;
  return { ...base, ...(structure ? { structure } : {}), block: input.block };
}

/** Five blocks; per block the pass flags for [oracle, baseline, irrelevant]. */
function screen(passes: Array<[boolean | "unhealthy" | "semantic-fail" | "indeterminate", boolean | "unhealthy" | "semantic-fail" | "indeterminate", boolean | "unhealthy" | "semantic-fail" | "indeterminate"]>) {
  const attempts: Array<StagedAttemptReport & { block: number }> = [];
  passes.forEach(([oracle, baseline, irrelevant], index) => {
    attempts.push(attempt({ condition_id: "oracle-practice", block: index + 1 }, oracle));
    attempts.push(attempt({ condition_id: "baseline", block: index + 1 }, baseline));
    attempts.push(attempt({ condition_id: "irrelevant-practice", block: index + 1 }, irrelevant));
  });
  return attempts;
}

test("directional requires strictly-greater count and paired majority over each control", () => {
  const result = interpretDirectionalScreen(screen([[true, false, false], [true, false, false], [true, "unhealthy", false], [true, true, false], [true, false, "semantic-fail"]]));
  expect(result.conclusion).toBe("directional");
  expect(result.structure_pass_counts["oracle-practice"]).toBe(5);
  expect(result.paired_majority).toEqual({ baseline: true, irrelevant_practice: true });
  expect(result.planned_denominator).toBe(15);
});

test("count advantage without paired majority is no-discriminability", () => {
  // Oracle count 3 > baseline 2, but oracle strictly wins only 2 of 5 blocks: no majority.
  const result = interpretDirectionalScreen(screen([[true, false, false], [false, true, false], [true, true, false], [false, false, false], [true, false, false]]));
  expect(result.structure_pass_counts["oracle-practice"]).toBe(3);
  expect(result.structure_pass_counts.baseline).toBe(2);
  expect(result.paired_majority.baseline).toBe(false);
  expect(result.conclusion).toBe("no-discriminability");
});

test("baseline saturation short-circuits to saturated", () => {
  const result = interpretDirectionalScreen(screen([[true, true, false], [true, true, false], [false, true, false], [true, true, false], [true, true, false]]));
  expect(result.saturation.triggered).toBe(true);
  expect(result.conclusion).toBe("saturated");
});

test("fewer than three effective observations per condition is insufficient", () => {
  const result = interpretDirectionalScreen(screen([[true, "unhealthy", "unhealthy"], ["semantic-fail", true, "unhealthy"], [true, "unhealthy", "unhealthy"], [true, true, true], [true, true, "semantic-fail"]]));
  expect(result.effective_observations["irrelevant-practice"]).toBe(2);
  expect(result.conclusion).toBe("insufficient-observations");
  expect(result.planned_denominator).toBe(15);
});

test("indeterminate and unhealthy attempts stay in the denominator as non-pass", () => {
  // Indeterminate attempts are effective observations (evaluated with structure);
  // only genuinely unhealthy attempts shrink the effective count.
  const result = interpretDirectionalScreen(screen([[true, "indeterminate", false], [true, "indeterminate", false], [true, "indeterminate", false], [true, true, false], [true, true, false]]));
  expect(result.planned_denominator).toBe(15);
  expect(result.structure_pass_counts.baseline).toBe(2);
  expect(result.structure_pass_counts["irrelevant-practice"]).toBe(0);
  expect(result.conclusion).toBe("directional");
});

test("unknown conditions are rejected", () => {
  expect(() => interpretDirectionalScreen([{ ...attempt({ condition_id: "baseline", block: 1 }, true), condition_id: "surprise" as never }])).toThrow("unknown screen condition");
  expect(screenConditions).toEqual(["baseline", "oracle-practice", "irrelevant-practice"]);
});
