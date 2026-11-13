import { spawn } from "node:child_process";
import { isAbsolute } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

function requiredAbsolutePath(name: string): string {
  const value = process.env[name];
  if (!value || !isAbsolute(value)) throw new Error(`${name} must be an absolute path`);
  return value;
}

export default function loreExtension(pi: ExtensionAPI): void {
  const cli = requiredAbsolutePath("LORE_CLI_PATH");
  const store = requiredAbsolutePath("LORE_STORE_ROOT");
  const cache = requiredAbsolutePath("LORE_CACHE_ROOT");
  if (/\.(cmd|bat)$/i.test(cli)) throw new Error("LORE_CLI_PATH must be an executable, not a shell script");

  async function invoke(command: "query" | "get", args: string[], signal?: AbortSignal) {
    const globals = ["--json", "--store-root", store, "--no-project"];
    if (command === "query") globals.push("--cache-root", cache);
    const { promise, resolve, reject } = Promise.withResolvers<{ stdout: string; stderr: string; exitCode: number | null }>();
    const child = spawn(cli, [...globals, command, ...args], {
      shell: false,
      signal,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (exitCode, terminatedBySignal) => {
      if (signal?.aborted) return reject(new Error("Lore invocation aborted"));
      if (terminatedBySignal) return reject(new Error(`Lore ${command} terminated by ${terminatedBySignal}`));
      resolve({ stdout, stderr, exitCode });
    });
    const result = await promise;
    let envelope: unknown;
    try {
      envelope = JSON.parse(result.stdout);
    } catch {
      throw new Error(`Lore ${command} returned invalid JSON (exit ${result.exitCode}): ${result.stderr.trim()}`);
    }
    if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
      throw new Error(`Lore ${command} returned an invalid protocol envelope (exit ${result.exitCode})`);
    }
    const response = envelope as Record<string, unknown>;
    if (response.protocolVersion !== 2 || response.command !== command || typeof response.ok !== "boolean" ||
        (response.ok ? !("data" in response) : !response.error || typeof response.error !== "object" || Array.isArray(response.error))) {
      throw new Error(`Lore ${command} returned an invalid protocol envelope (exit ${result.exitCode})`);
    }
    return {
      content: [{ type: "text" as const, text: result.stdout }],
      details: { envelope, exitCode: result.exitCode, status: response.ok && result.exitCode === 0 ? "success" : "non-success", stderr: result.stderr },
    };
  }

  pi.registerTool({
    name: "lore_query",
    label: "Lore query",
    description: "Search the selected Lore Store for relevant Practices. Returns the complete Lore JSON response; indexing or errors are reported in the response.",
    parameters: Type.Object({
      text: Type.String({ minLength: 1, description: "Search text" }),
      top_k: Type.Optional(Type.Integer({ minimum: 1, description: "Maximum number of results" })),
    }, { additionalProperties: false }),
    async execute(_toolCallId, { text, top_k }, signal) {
      const args = ["--mode", "single-vector", "--require-complete"];
      if (top_k !== undefined) args.push("--top-k", String(top_k));
      args.push("--", text);
      return invoke("query", args, signal);
    },
  });

  pi.registerTool({
    name: "lore_get",
    label: "Lore get",
    description: "Read a Practice by exact ID from the selected Lore Store. Returns the complete Lore JSON response.",
    parameters: Type.Object({
      practice_id: Type.String({ minLength: 1, description: "Exact Practice ID" }),
    }, { additionalProperties: false }),
    async execute(_toolCallId, { practice_id }, signal) {
      return invoke("get", ["--", practice_id], signal);
    },
  });
}
