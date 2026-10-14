import type { StagedAttemptReport } from "./staged-profile-diagnostic-runner";

export const screenConditions = ["baseline", "oracle-practice", "irrelevant-practice"] as const;
export type ScreenCondition = typeof screenConditions[number];
export type ScreenConclusion = "directional" | "no-discriminability" | "saturated" | "insufficient-observations";
export const screenMinimumEffectiveObservations = 3;
export const screenSaturationRate = 0.8;

export type ScreenBlockPairing = {
  block: number;
  oracle_structure_pass: boolean;
  baseline_structure_pass: boolean;
  irrelevant_structure_pass: boolean;
};

export type ScreenInterpretation = {
  schema_version: "directional-screen-interpretation/v1";
  conclusion: ScreenConclusion;
  structure_pass_counts: Record<ScreenCondition, number>;
  effective_observations: Record<ScreenCondition, number>;
  planned_denominator: number;
  saturation: { rate: number; threshold: number; triggered: boolean };
  blocks: ScreenBlockPairing[];
  paired_majority: { baseline: boolean; irrelevant_practice: boolean };
  basis: string;
};

/** Attempts arrive in schedule order: five blocks of three attempts, one per condition. */
export function interpretDirectionalScreen(attempts: Array<StagedAttemptReport & { block: number }>): ScreenInterpretation {
  const counts = { baseline: 0, "oracle-practice": 0, "irrelevant-practice": 0 } as Record<ScreenCondition, number>;
  const effective = { baseline: 0, "oracle-practice": 0, "irrelevant-practice": 0 } as Record<ScreenCondition, number>;
  for (const attempt of attempts) {
    if (!screenConditions.includes(attempt.condition_id)) throw new Error(`unknown screen condition: ${attempt.condition_id}`);
    if (attempt.structure?.structure_pass === true) counts[attempt.condition_id] += 1;
    if (attempt.execution_health === "evaluated" && attempt.structure) effective[attempt.condition_id] += 1;
  }
  const baselineRate = attempts.length === 0 ? 0 : counts.baseline / Math.max(1, effective.baseline);
  const blockNumbers = [...new Set(attempts.map((attempt) => attempt.block))].sort((left, right) => left - right);
  const blocks: ScreenBlockPairing[] = blockNumbers.map((block) => {
    const pass = (condition: ScreenCondition) => attempts.some((attempt) => attempt.block === block && attempt.condition_id === condition && attempt.structure?.structure_pass === true);
    return { block, oracle_structure_pass: pass("oracle-practice"), baseline_structure_pass: pass("baseline"), irrelevant_structure_pass: pass("irrelevant-practice") };
  });
  // Majority-of-paired-blocks: oracle must strictly win (pass while the control
  // does not) more than half of all planned blocks against each control. A raw
  // count advantage alone is equivalent to net pair wins, so the block-majority
  // threshold is what makes this rule stricter than the count rule.
  const majority = (control: keyof ScreenBlockPairing & string) => {
    const wins = blocks.filter((entry) => entry.oracle_structure_pass && !entry[control]).length;
    return blocks.length > 0 && wins * 2 > blocks.length;
  };
  const pairedMajority = { baseline: majority("baseline_structure_pass"), irrelevant_practice: majority("irrelevant_structure_pass") };
  const saturation = { rate: baselineRate, threshold: screenSaturationRate, triggered: baselineRate >= screenSaturationRate && effective.baseline > 0 };
  const strictlyGreater = counts["oracle-practice"] > counts.baseline && counts["oracle-practice"] > counts["irrelevant-practice"];
  const shortage = screenConditions.filter((condition) => effective[condition] < screenMinimumEffectiveObservations);
  let conclusion: ScreenConclusion;
  let basis: string;
  if (shortage.length > 0) {
    conclusion = "insufficient-observations";
    basis = `effective structure observations below ${screenMinimumEffectiveObservations} for: ${shortage.join(", ")}`;
  } else if (saturation.triggered) {
    conclusion = "saturated";
    basis = `baseline structure-pass rate ${baselineRate.toFixed(2)} reached the ${screenSaturationRate} saturation threshold`;
  } else if (strictlyGreater && pairedMajority.baseline && pairedMajority.irrelevant_practice) {
    conclusion = "directional";
    basis = `oracle structure passes (${counts["oracle-practice"]}) strictly exceed both controls (${counts.baseline}, ${counts["irrelevant-practice"]}) with paired-block majority over each`;
  } else {
    conclusion = "no-discriminability";
    basis = `oracle count strictly greater: ${strictlyGreater}; paired majority over baseline: ${pairedMajority.baseline}; over irrelevant-practice: ${pairedMajority.irrelevant_practice}`;
  }
  return {
    schema_version: "directional-screen-interpretation/v1",
    conclusion,
    structure_pass_counts: counts,
    effective_observations: effective,
    planned_denominator: attempts.length,
    saturation,
    blocks,
    paired_majority: pairedMajority,
    basis,
  };
}
