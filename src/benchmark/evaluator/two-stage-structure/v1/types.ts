export type StructureCheckId =
  | "stage-1-semantic"
  | "stage-2-semantic"
  | "stage-1-snapshot-integrity"
  | "handler-stability"
  | "transport-isolation"
  | "policy-continuity"
  | "ledger-continuity"
  | "provider-extension-locality"
  | "diff-classifiability";

export type StructureLabel = "pass" | "fail" | "indeterminate";
export type SemanticLabel = "pass" | "fail" | "indeterminate";
export type ExecutionHealth = "evaluated" | "execution-unhealthy";

export type SnapshotFile = { path: string; sha256: string };
export type Stage1Snapshot = {
  hash_algorithm: "sha256";
  tree_sha256: string;
  files: SnapshotFile[];
};

export type SemanticResults = {
  stage_1: SemanticLabel;
  stage_2: SemanticLabel;
};

export type StructureMetrics = {
  changed_production_files: number;
  changed_declarations: number;
  handler_changed_declarations: number;
  policy_changed_declarations: number;
  ledger_changed_declarations: number;
  transport_changed_declarations: number;
  deleted_stage_1_declarations: number;
  replaced_stage_1_declarations: number;
  normalized_changed_ast_nodes: number;
  maximum_single_file_edit_share: number;
};

export type StructureCheck = {
  id: StructureCheckId;
  state: StructureLabel;
  reason: string;
};

export type StructureEvaluationInput = {
  stage_1_root: string;
  stage_2_root: string;
  semantic: SemanticResults;
  stage_1_snapshot: Stage1Snapshot;
  dependency_immutability?: StructureLabel;
};

export type StructureEvaluationResult = {
  schema_version: "two-stage-structure-result/v1";
  execution_health: ExecutionHealth;
  checks: StructureCheck[];
  metrics: StructureMetrics;
  structure_pass: boolean;
};
