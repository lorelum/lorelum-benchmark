import Ajv2020 from "ajv/dist/2020";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { modelEndpoint } from "./model-endpoint";

export type AutonomousPlan = {
  schema_version: "autonomous-pack-plan/v1";
  id: string;
  run_kind: "pilot" | "official";
  tasks: { id: string; source_sha256: string; input_sha256: string; evaluator_sha256: string }[];
  repetitions: number;
  /** Randomizes ordering only; this is not a model sampling seed. */
  order_seed: number;
  common: {
    environment_sha256: string; image_sha256: string; agent: string; model: string;
    /** SHA-256 of the normalized HTTPS chat-completions URL, without credentials. Optional only for historical plans. */
    model_endpoint_sha256?: string;
    model_parameters_sha256: string; profile_sha256: string; tool_policy_sha256: string; system_prompt_sha256: string;
    budget: { max_turns: number; max_duration_ms: number };
  };
  pack: { source: string; snapshot_uri: string; snapshot_sha256: string; index_sha256: string };
};
export type Condition = "empty-store" | "pack-installed";
export type ScheduledRun = {
  pair_id: string; task_id: string; repetition: number; condition: Condition; ordinal: number;
  input_sha256: string; common_sha256: string;
};

const schema = JSON.parse(readFileSync(new URL("../../../../schemas/autonomous-pack-plan-v1.schema.json", import.meta.url), "utf8"));
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);

/** Canonical JSON hashes are shared with the executor; keys sort recursively. */
export function hashContract(value: unknown): string {
  const canonical = (item: unknown): string => {
    if (item === null || typeof item === "string" || typeof item === "boolean" || (typeof item === "number" && Number.isFinite(item))) return JSON.stringify(item)!;
    if (Array.isArray(item)) return `[${item.map(canonical).join(",")}]`;
    if (typeof item === "object" && item !== null && Object.getPrototypeOf(item) === Object.prototype) {
      return `{${Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
    }
    throw new Error("Cannot hash a non-JSON contract value");
  };
  return createHash("sha256").update(canonical(value)).digest("hex");
}
/** Hash the effective proxy endpoint without retaining the URL or API key in the plan. */
export function modelEndpointSha256(baseUrl: string): string {
  return createHash("sha256").update(modelEndpoint(baseUrl).href, "utf8").digest("hex");
}


export function assertPlan(value: unknown): asserts value is AutonomousPlan {
  if (!validate(value)) throw new Error(`Invalid autonomous Pack plan: ${JSON.stringify(validate.errors)}`);
  const plan = value as AutonomousPlan;
  if (new Set(plan.tasks.map(task => task.id)).size !== plan.tasks.length) throw new Error("Duplicate task id");
}

/** Deterministic paired schedule, alternating order within each task and balancing odd repetitions globally. */
export function schedulePlan(plan: AutonomousPlan): ScheduledRun[] {
  assertPlan(plan);
  const common = hashContract(plan.common);
  const tasks = [...plan.tasks].sort((a, b) => {
    const x = hashContract([plan.order_seed, a.id]);
    const y = hashContract([plan.order_seed, b.id]);
    return x < y ? -1 : x > y ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const first = parseInt(hashContract([plan.order_seed, "first-condition"]).slice(0, 2), 16) % 2;
  const runs: ScheduledRun[] = [];
  tasks.forEach((task, taskIndex) => {
    for (let repetition = 0; repetition < plan.repetitions; repetition++) {
      const pair_id = hashContract([plan.id, task.id, repetition]);
      const emptyFirst = (first + taskIndex + repetition) % 2 === 0;
      const order: Condition[] = emptyFirst ? ["empty-store", "pack-installed"] : ["pack-installed", "empty-store"];
      for (const condition of order) runs.push({ pair_id, task_id: task.id, repetition, condition, ordinal: runs.length, input_sha256: task.input_sha256, common_sha256: common });
    }
  });
  return runs;
}
