import { isRecord } from "./json";

export type ExecutionProfile = {
  schema_version: "autonomous-pack-execution-profile/v1";
  profile_id: string; encoding_id: string; model_sha256: string;
  empty_index_sha256: string; empty_metadata_sha256: string; installed_metadata_sha256: string;
  proxy_image_sha256: string;
};
export type ModelParameters = { api_model_id: string; context_window: number; max_tokens: number };
export type IndexMetadata = { condition: "empty-store" | "pack-installed"; pack_sha256: string; model_sha256: string; profile_id: string; encoding_id: string; index_sha256: string };
export type ExecutionInput = {
  environment: unknown; modelParameters: unknown; profile?: unknown;
  emptyMetadata: unknown; installedMetadata: unknown;
  runtimes: readonly string[];
  identities: { pack: string; model: string; emptyArchive: string; installedArchive: string; emptyMetadata: string; installedMetadata: string };
  expected?: { agent: string; model: string; installedIndex: string };
  proxyImageSha256?: string;
};
export type ValidatedExecutionInput = {
  agent: string; modelId: string; model: ModelParameters; profile: ExecutionProfile;
  empty: IndexMetadata; installed: IndexMetadata;
};

const digest = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

function metadata(value: unknown, condition: IndexMetadata["condition"]): IndexMetadata {
  const keys = ["condition", "pack_sha256", "model_sha256", "profile_id", "encoding_id", "index_sha256"];
  if (!isRecord(value) || !exact(value, keys) || value.condition !== condition || keys.slice(1).some(key => !digest(value[key]))) throw new Error("Index provenance mismatch");
  return value as IndexMetadata;
}

/** Validate parsed input and independently computed artifact identities without I/O or mutation. */
export function parseExecutionInput(input: ExecutionInput): ValidatedExecutionInput {
  const empty = metadata(input.emptyMetadata, "empty-store");
  const installed = metadata(input.installedMetadata, "pack-installed");
  const profileKeys = ["schema_version", "profile_id", "encoding_id", "model_sha256", "empty_index_sha256", "empty_metadata_sha256", "installed_metadata_sha256", "proxy_image_sha256"];
  const value: unknown = input.profile === undefined ? {
    schema_version: "autonomous-pack-execution-profile/v1", profile_id: installed.profile_id, encoding_id: installed.encoding_id,
    model_sha256: installed.model_sha256, empty_index_sha256: empty.index_sha256,
    empty_metadata_sha256: input.identities.emptyMetadata, installed_metadata_sha256: input.identities.installedMetadata,
    proxy_image_sha256: input.proxyImageSha256,
  } : input.profile;
  if (!isRecord(value) || !exact(value, profileKeys) || value.schema_version !== "autonomous-pack-execution-profile/v1" || profileKeys.slice(1).some(key => !digest(value[key]))) throw new Error("Invalid execution profile");
  const profile = value as ExecutionProfile;
  if ([empty, installed].some(item => item.pack_sha256 !== input.identities.pack || item.model_sha256 !== profile.model_sha256 || item.profile_id !== profile.profile_id || item.encoding_id !== profile.encoding_id) ||
      input.identities.model !== profile.model_sha256 || input.identities.emptyArchive !== profile.empty_index_sha256 || empty.index_sha256 !== profile.empty_index_sha256 ||
      input.identities.installedArchive !== installed.index_sha256 || (input.expected && input.identities.installedArchive !== input.expected.installedIndex) || input.identities.emptyMetadata !== profile.empty_metadata_sha256 || input.identities.installedMetadata !== profile.installed_metadata_sha256) throw new Error("Index provenance mismatch");
  const params = input.modelParameters;
  if (!isRecord(params) || !exact(params, ["api_model_id", "context_window", "max_tokens"]) || typeof params.api_model_id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(params.api_model_id) || !Number.isSafeInteger(params.context_window) || !Number.isSafeInteger(params.max_tokens) || (params.context_window as number) < 1 || (params.max_tokens as number) < 1 || (params.max_tokens as number) > (params.context_window as number)) throw new Error("Invalid model parameters");
  const model = params as ModelParameters;
  const env = input.environment;
  if (!isRecord(env) || !isRecord(env.agent_runtime) || typeof env.agent_runtime.id !== "string" || !env.agent_runtime.id || !isRecord(env.model) || typeof env.model.id !== "string" || !isRecord(env.embedding) || env.embedding.model_sha256 !== profile.model_sha256 || env.embedding.profile_id !== profile.profile_id || env.embedding.encoding_id !== profile.encoding_id || env.embedding.retrieval_method !== "single-vector" || !isRecord(env.task_runtimes)) throw new Error("Environment and execution profile mismatch");
  const runtimes = env.task_runtimes;
  if (input.runtimes.some(runtime => typeof runtimes[runtime] !== "string" || !runtimes[runtime])) throw new Error("Environment and execution profile mismatch");
  const agent = env.agent_runtime.id, modelId = env.model.id;
  const separator = modelId.indexOf("/");
  if (separator < 1 || modelId.slice(separator + 1) !== model.api_model_id || (input.expected && (input.expected.agent !== agent || input.expected.model !== modelId))) throw new Error("Model or agent identity mismatch");
  return { agent, modelId, model, profile, empty, installed };
}
