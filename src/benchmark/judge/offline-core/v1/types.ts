export const scenarioSchemaVersion = "offline-judge-scenario/v1" as const;
export const calibrationSchemaVersion = "offline-judge-calibration/v1" as const;
export const runSchemaVersion = "offline-judge-run/v1" as const;

export type EvidenceKind = "code" | "text" | "structured";
export type RelationVerdict = "supports" | "contradicts" | "insufficient";
export type PairVerdict = "A" | "B" | "tie" | "insufficient";
export type Confidence = "low" | "medium" | "high";
export type CaseKind = "decisive" | "equivalent" | "insufficient";
export type Orientation = "AB" | "BA";

export type EvidenceItem = {
  id: string;
  kind: EvidenceKind;
  label: string;
  content: string;
  sha256: string;
};

export type CandidateEvidence = {
  summary: string;
  items: EvidenceItem[];
};

export type RubricCriterion = {
  id: string;
  description: string;
};

export type ScenarioProfile = {
  schema_version: typeof scenarioSchemaVersion;
  id: string;
  version: string;
  adapter_version: string;
  description: string;
};

export type PairCase = {
  id: string;
  criterion: RubricCriterion;
  kind: CaseKind;
  a: CandidateEvidence;
  b: CandidateEvidence;
  insufficient_reason?: string;
  provenance: {
    source_ids: string[];
    evidence_hash: string;
  };
};

export type ExpectedVerdict = PairVerdict;

export type CalibrationLabel = {
  case_id: string;
  expected: ExpectedVerdict;
};

export type ScenarioBundle = {
  profile: ScenarioProfile;
  rubric: {
    id: string;
    version: string;
    criteria: RubricCriterion[];
  };
  cases: PairCase[];
  labels: CalibrationLabel[];
};

export type ScenarioAdapter = {
  loadScenario(root: string): Promise<ScenarioBundle>;
};

export type RawModelVerdict = {
  a_relation: RelationVerdict;
  b_relation: RelationVerdict;
  verdict: PairVerdict;
  confidence: Confidence;
  citations: string[];
  reason?: string;
};

export type DecisionState = "observed" | "insufficient" | "invalid" | "not-run";

export type JudgeDecision = {
  case_id: string;
  scenario_id: string;
  criterion_id: string;
  orientation: Orientation;
  state: DecisionState;
  verdict: PairVerdict;
  confidence: Confidence | null;
  citations: string[];
  raw: unknown;
  reason?: string;
  input_hash: string;
  prompt_hash: string;
  evidence_ids: string[];
  canonical_verdict: PairVerdict;
};

export type RunIdentity = {
  run_id: string;
  scenario: { id: string; version: string; adapter_version: string };
  core_hash: string;
  system_prompt_hash: string;
  rubric_hash: string;
  labels_hash: string;
  model: {
    id: string;
    revision: string;
    quantization: string;
    file_sha256: string;
    file_size_bytes: number;
  };
  runtime: {
    id: string;
    version: string;
    artifact_sha256: string;
    base_url: string;
    context_size: number;
    temperature: number;
    top_k: number;
    seed: number;
    max_tokens: number;
  };
  threshold: RunThresholds;
};

export type RunThresholds = {
  schema_validity: number;
  citation_validity: number;
  development_decisive_accuracy: number;
  holdout_decisive_accuracy: number;
  equivalence_stability: number;
  order_consistency: number;
  unexpected_abstain: number;
  high_confidence_errors: number;
};

export type MetricValue = number | null;

export type RunMetrics = {
  schema_validity: MetricValue;
  citation_validity: MetricValue;
  decisive_accuracy: MetricValue;
  equivalence_stability: MetricValue;
  order_consistency: MetricValue;
  unexpected_abstain: MetricValue;
  high_confidence_errors: number;
  insufficient_controls_abstained: number;
  insufficient_controls_total: number;
};

export type ScenarioRunResult = {
  schema_version: typeof runSchemaVersion;
  identity: RunIdentity;
  thresholds: RunThresholds;
  metrics: RunMetrics;
  checks: Record<string, boolean>;
  passed: boolean;
  decisions: JudgeDecision[];
};

export type ModelCompletion = (system: string, user: string) => Promise<unknown>;

