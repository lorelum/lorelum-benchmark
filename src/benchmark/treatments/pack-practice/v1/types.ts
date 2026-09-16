export const packPracticeSchemaVersion = "pack-practice-treatment/v1" as const;
export const timingNodes = ["task_start", "constraint_followup", "first_implementation_checkpoint"] as const;
export type TimingNode = typeof timingNodes[number];

export type PackPracticeManifest = {
  schema_version: typeof packPracticeSchemaVersion;
  id: string;
  version: string;
  kind: "retrieval";
  injection: { delivery: "practice-card"; channel: "condition-scoped-private-runtime" };
  pack: { repository: string; ref: string; version: string; commit: string };
  practice: {
    id: string;
    source_path: string;
    content_digest: string;
    source_sha256: string;
    card_sha256: string;
    body_path: string;
  };
  selection: { mode: "semantic"; query_sha256: string; path: string };
  applicability: { scenario: "async-report-lifecycle/scope_changed/v1"; status: "reviewed"; basis_path: string; basis_sha256: string };
  privacy: { materialization: "forbidden"; secrets: "excluded" };
};

export type LoreQueryResult = {
  practiceId: string;
  title: string;
  stage: string;
  techStack: string[];
  appliesWhen: string;
  severity: string;
  contentDigest: string;
};

export type LoreQueryData = {
  mode: "semantic" | "keyword";
  results: LoreQueryResult[];
  profileId?: string;
  coverage?: string;
};

export type LoreGetSource = { packName: string; sourcePath: string; packRoot?: string };
export type LoreGetData = {
  practice: { id: string; title: string; stage: string; tech_stack: string[]; applies_when: string; severity: string; body: string };
  contentDigest: string;
  sources: LoreGetSource[];
};

export type SelectionRecord = {
  schema_version: "pack-practice-selection/v1";
  captured_from: "prepare-fixture" | "lore-cli";
  lore_cli_version: string;
  commands: { install: string[]; query: string[]; get: string[] };
  pack: { repository: string; ref: string; version: string; commit: string };
  install_response_sha256: string;
  query: {
    text: string;
    mode: "semantic";
    top_k: number;
    query_sha256: string;
    response_sha256: string;
    selected_practice_id: string;
    selected_rank: number;
    results: LoreQueryResult[];
  };
  get: {
    practice_id: string;
    content_digest: string;
    response_sha256: string;
    source: { pack_name: string; source_path: string };
    source_sha256: string;
    card_sha256: string;
  };
};

export type ApplicabilityRecord = {
  schema_version: "pack-practice-applicability/v1";
  scenario: "async-report-lifecycle/scope_changed/v1";
  status: "reviewed";
  applies_when: string;
  facts: Array<{ id: string; observed: boolean; description: string }>;
  changed_dimensions: { scope: boolean; risk: boolean; verification: boolean };
};

export type PreparedPracticePayload = Readonly<{
  treatment_id: string;
  treatment_version: string;
  practice_id: string;
  content_digest: string;
  card_sha256: string;
  text: string;
}>;

export type PackProvenance = Readonly<{
  repository: string;
  ref: string;
  version: string;
  commit: string;
  practice_id: string;
  source_path: string;
  content_digest: string;
  source_sha256: string;
  card_sha256: string;
}>;

export type PreparedPackPractice = Readonly<{
  manifest: PackPracticeManifest;
  payload: PreparedPracticePayload;
  provenance: PackProvenance;
  selection: SelectionRecord;
  applicability: ApplicabilityRecord;
}>;

export type DeliveryStatus = "delivered" | "not-declared" | "failed" | "unsupported" | "indeterminate";
export type PublicDeliveryTrace = Readonly<{
  schema_version: "pack-practice-delivery-trace/v1";
  condition_id: string;
  node: TimingNode;
  treatment_id: string;
  treatment_version: string;
  practice_id?: string;
  card_sha256?: string;
  status: DeliveryStatus;
}>;

export type DeliveryResult = Readonly<{
  payload?: PreparedPracticePayload;
  trace: PublicDeliveryTrace;
}>;

export type AuditSidecar = Readonly<{
  schema_version: "pack-practice-audit/v1";
  treatment: { id: string; version: string };
  provenance: PackProvenance;
  selection: { captured_from: SelectionRecord["captured_from"]; install_response_sha256: string; query_sha256: string; query_response_sha256: string; get_response_sha256: string; selected_rank: number };
  applicability: { scenario: string; basis_sha256: string; status: string };
  deliveries: Array<{ condition_id: string; node: TimingNode; status: DeliveryStatus; practice_id?: string; card_sha256?: string }>;
  identity_consistent: boolean;
}>;
