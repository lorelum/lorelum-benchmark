/**
 * treatment-comparison/v1 profile contract - Skill comparison track.
 *
 * Defines the contract shape for Skill-comparison tasks. This is a pure type
 * contract; the core does not parse or validate these fields.
 */

/** A declared treatment in a treatment-comparison task. */
export type TreatmentDeclaration = {
  id: string;
  rule_audits: string[];
  applicable_conditions: string[];
};

/** A rule-behavior mapping declared in a rule audit. */
export type RuleBehavior = {
  id: string;
  rule: string;
};

/** Oracle mapping linking behaviors to quality probes and mutations. */
export type OracleMapping = {
  id: string;
  rule_behavior_id: string;
};

/** The full treatment-comparison/v1 profile declaration. */
export type TreatmentComparisonProfile = {
  treatments: TreatmentDeclaration[];
  rule_behaviors: RuleBehavior[];
  oracle: {
    quality_probes: OracleMapping[];
    mutations: OracleMapping[];
  };
};
