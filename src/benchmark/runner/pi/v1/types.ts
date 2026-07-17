export type PiRunRequest = {
  schema_version: "pi-run/v1";
  run_id: string;
  suite: { id: string; version: string };
  task: { id: string; revision: string; snapshot_id: string };
  treatment: { id: string; version: string };
  environment: { id: string; version: string };
  scorer: { id: string; version: string };
  agent: { id: string; version: string; model: string; system_prompt_hash: string };
  execution: {
    command: string;
    args: string[];
    cwd: string;
    seed: number;
    budget: { max_turns: number; max_duration_ms: number };
    tool_policy_hash: string;
  };
  inputs: Record<string, string>;
  artifacts: { directory: string; manifest_path: string };
};

export type PiRunResult = {
  schema_version: "pi-run-result/v1";
  run_id: string;
  status: "completed" | "failed";
  exit_code: number;
  completed_at: string;
};
