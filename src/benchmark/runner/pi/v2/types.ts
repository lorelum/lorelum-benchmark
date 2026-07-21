export type PiRunRequestV2 = {
  schema_version: "pi-run/v2";
  run_id: string;
  experiment_id: string;
  experiment_plan_hash: string;
  run_kind: "smoke" | "pilot" | "official";
  condition_id: string;
  repeat: number;
  source_commit: string;
  candidate_path: string;
  suite: { id: string; version: string };
  task: { id: string; revision: string; snapshot_id: string };
  treatment: { id: string; version: string };
  environment: { id: string; version: string };
  scorer: { id: string; version: string };
  agent: { id: string; version: string; model: string; model_version: string; system_prompt_hash: string };
  execution: {
    command: string;
    args: string[];
    seed: number;
    budget: { max_turns: number; max_duration_ms: number };
    tool_policy_hash: string;
  };
  inputs: Record<string, string>;
  artifacts: { manifest_name: string };
};

export type PiRunArtifactManifestV2 = {
  schema_version: "pi-run-artifact/v2";
  run_id: string;
  experiment_id: string;
  experiment_plan_hash: string;
  run_kind: "smoke" | "pilot" | "official";
  condition_id: string;
  repeat: number;
  source_commit: string;
  adapter_commit: string;
  candidate_path: string;
  suite: PiRunRequestV2["suite"];
  task: PiRunRequestV2["task"];
  treatment: PiRunRequestV2["treatment"] & {
    manifest_path: string;
    source?: { repository: string; revision: string; path: string; bundle_sha256: string };
  };
  environment: PiRunRequestV2["environment"] & { manifest_path: string };
  scorer: PiRunRequestV2["scorer"];
  agent: PiRunRequestV2["agent"];
  execution: PiRunRequestV2["execution"] & { cwd: string };
  inputs: PiRunRequestV2["inputs"];
  rule_audit?: {
    manifest_path: string;
    sha256: string;
    treatment: { id: string; version: string };
    required_rules: string[];
  };
  rule_context?: {
    schema_version: "pi-rule-context/v1";
    router: { id: "public-bm25"; version: "v1"; maxRules: 3 };
    public_input_sha256: string;
    bundle_sha256: string;
    rules: Array<{ path: string; sha256: string; score: number }>;
    sha256: string;
  };
  trace?: { stdout_path: string; stderr_path: string; audit_path?: string };
  workspace: { path: string; task_md_sha256: string; starter_files: Record<string, string> };
  status: "prepared" | "completed" | "failed";
  timed_out: boolean;
  exit_code: number | null;
  completed_at: string | null;
};

export type PiRunResultV2 = {
  schema_version: "pi-run-result/v2";
  run_id: string;
  status: "completed" | "failed";
  exit_code: number | null;
  workspace: string;
  artifact_manifest: string;
  completed_at: string;
};
