import { sha256File } from "../../../fs";
import type { ModelCompletion } from "./types";

export type LocalRuntimeConfig = {
  schema_version: "offline-judge-runtime/v1";
  base_url: string;
  model: {
    id: string;
    revision: string;
    quantization: string;
    path: string;
    file_sha256: string;
    file_size_bytes: number;
  };
  runtime: {
    id: string;
    version: string;
    artifact_sha256: string;
    binary_sha256: string;
    executable?: string;
  };
  context_size: number;
  temperature: number;
  top_k: number;
  seed: number;
  max_tokens: number;
};

export class RuntimeBoundaryError extends Error {
  constructor(message: string) {
    super(`Offline judge runtime boundary violation: ${message}`);
  }
}

export function assertLoopbackBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RuntimeBoundaryError("base_url must be a valid URL");
  }
  if (url.protocol !== "http:") throw new RuntimeBoundaryError("base_url must use http");
  if (!new Set(["127.0.0.1", "localhost", "::1", "[::1]"]).has(url.hostname)) {
    throw new RuntimeBoundaryError(`base_url must be loopback, got ${url.hostname}`);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new RuntimeBoundaryError("base_url must not contain credentials, query, or fragment");
  }
  return url.toString().replace(/\/+$/, "");
}

export function validateRuntimeConfig(config: LocalRuntimeConfig): void {
  if (config.schema_version !== "offline-judge-runtime/v1") throw new RuntimeBoundaryError("invalid runtime schema_version");
  assertLoopbackBaseUrl(config.base_url);
  for (const key of ["id", "revision", "quantization", "path", "file_sha256"] as const) {
    if (typeof config.model[key] !== "string" || config.model[key].trim() === "") {
      throw new RuntimeBoundaryError(`model.${key} is required`);
    }
  }
  if (!/^[a-f0-9]{64}$/.test(config.model.file_sha256)) throw new RuntimeBoundaryError("model.file_sha256 must be a SHA-256");
  if (!Number.isSafeInteger(config.model.file_size_bytes) || config.model.file_size_bytes < 1) {
    throw new RuntimeBoundaryError("model.file_size_bytes must be positive");
  }
  if (config.runtime.id !== "llama.cpp" || config.runtime.version !== "b11207") {
    throw new RuntimeBoundaryError("runtime must be pinned to llama.cpp b11207");
  }
  if (config.runtime.artifact_sha256 !== "738f8c251ac22b70c3ae6f83a10cf222725df0395246a2cf58f32bdb85fbe668") {
    throw new RuntimeBoundaryError("runtime artifact hash does not match the frozen identity");
  }
  if (config.runtime.binary_sha256 !== "3efd633317d9eec15518c21c73641fa637a000c3aea88c6fe4158befe16635b1") {
    throw new RuntimeBoundaryError("runtime binary hash does not match the frozen identity");
  }
  if (config.model.id !== "Qwen/Qwen3-1.7B-GGUF" || config.model.revision !== "90862c4b9d2787eaed51d12237eafdfe7c5f6077") {
    throw new RuntimeBoundaryError("model identity does not match the frozen identity");
  }
  if (config.model.quantization !== "Q8_0" || config.model.file_sha256 !== "061b54daade076b5d3362dac252678d17da8c68f07560be70818cace6590cb1a") {
    throw new RuntimeBoundaryError("model artifact does not match the frozen identity");
  }
  if (config.model.file_size_bytes !== 1_834_426_016) throw new RuntimeBoundaryError("model file size does not match the frozen identity");
  if (config.context_size !== 8192 || config.temperature !== 0 || config.top_k !== 1 || config.seed !== 20260927) {
    throw new RuntimeBoundaryError("runtime generation parameters do not match the frozen identity");
  }
  if (!Number.isSafeInteger(config.max_tokens) || config.max_tokens < 64 || config.max_tokens > 1024) {
    throw new RuntimeBoundaryError("max_tokens must be an integer between 64 and 1024");
  }
}

export async function assertModelArtifact(config: LocalRuntimeConfig): Promise<void> {
  validateRuntimeConfig(config);
  const file = Bun.file(config.model.path);
  if (!(await file.exists())) throw new RuntimeBoundaryError(`model artifact not found: ${config.model.path}`);
  const actualSize = file.size;
  if (actualSize !== config.model.file_size_bytes) {
    throw new RuntimeBoundaryError(`model artifact size mismatch: expected ${config.model.file_size_bytes}, got ${actualSize}`);
  }
  const actualHash = await sha256File(config.model.path);
  if (actualHash !== config.model.file_sha256) {
    throw new RuntimeBoundaryError(`model artifact hash mismatch: expected ${config.model.file_sha256}, got ${actualHash}`);
  }
}

export function localRuntimeCompletion(config: LocalRuntimeConfig): ModelCompletion {
  validateRuntimeConfig(config);
  const baseUrl = assertLoopbackBaseUrl(config.base_url);
  return async (system, user) => {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: config.model.id,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: config.temperature,
        top_k: config.top_k,
        seed: config.seed,
        max_tokens: config.max_tokens,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "offline_judge_verdict",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["a_relation", "b_relation", "verdict", "confidence", "citations", "reason"],
              properties: {
                a_relation: { type: "string", enum: ["supports", "contradicts", "insufficient"] },
                b_relation: { type: "string", enum: ["supports", "contradicts", "insufficient"] },
                verdict: { type: "string", enum: ["A", "B", "tie", "insufficient"] },
                confidence: { type: "string", enum: ["low", "medium", "high"] },
                citations: { type: "array", minItems: 1, items: { type: "string" } },
                reason: { type: "string" },
              },
            },
          },
        },
        chat_template_kwargs: { enable_thinking: false },
      }),
    });
    if (!response.ok) throw new Error(`local judge runtime failed: HTTP ${response.status} ${(await response.text().catch(() => "")).slice(0, 300)}`);
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("local judge runtime returned no content");
    return JSON.parse(content) as unknown;
  };
}
