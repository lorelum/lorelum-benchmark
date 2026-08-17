import { appendFile, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { createHash } from "node:crypto";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

type PublicInput = { path: string; sha256: string; anchors: string[] };
type ReadEvent = { toolName?: unknown; toolCallId?: unknown; args?: unknown; isError?: unknown };
type AnchoredRequest = { query: string; public_refs: string[] };

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function anchors(value: string): string[] {
  return [...new Set((value.toLowerCase().match(/[a-z_][a-z0-9_]{2,}|[a-z]{1,16}-\d{1,8}|[\u4e00-\u9fff]{2,}/g) ?? [])
    .filter((token) => !["const", "return", "from", "type", "function", "window", "await"].includes(token)))]
    .slice(0, 64);
}

function relativePublicPath(cwd: string, input: string): string | undefined {
  const resolved = resolve(cwd, input);
  const relativePath = relative(cwd, resolved).replaceAll("\\", "/");
  if (!relativePath || relativePath.startsWith("../") || relativePath === "..") return undefined;
  return relativePath;
}

function readPathFromStart(event: ReadEvent): string | undefined {
  if (!event.args || typeof event.args !== "object") return undefined;
  const path = (event.args as { path?: unknown }).path;
  return typeof path === "string" ? path : undefined;
}

// task.md 通过 @task.md 注入初始消息，agent 直接可见；将其懒加载为初始公开输入，
// 使 agent 对题面锚点（如 PX-47）的查询能够通过锚定校验。
async function ensureInitialPublicInputs(cwd: string, publicInputs: Map<string, PublicInput>, auditSafely: (event: Record<string, unknown>) => Promise<void>): Promise<void> {
  if (publicInputs.has("task.md")) return;
  try {
    const content = await readFile(resolve(cwd, "task.md"), "utf8");
    const path = "task.md";
    const digest = sha256(content);
    publicInputs.set(path, { path, sha256: digest, anchors: anchors(content) });
    await auditSafely({ event: "public_input_read", path, sha256: digest, source: "initial-injection", anchors: anchors(content) });
  } catch { /* task.md 缺失不阻断查询 */ }
}

function anchoredPublicInputs(cwd: string, request: AnchoredRequest, publicInputs: Map<string, PublicInput>): { refs: string[]; inputs: PublicInput[]; matchedAnchors: string[] } | undefined {
  const refs = request.public_refs.map((entry) => relativePublicPath(cwd, entry)).filter((entry): entry is string => Boolean(entry));
  const inputs = refs.map((entry) => publicInputs.get(entry)).filter((entry): entry is PublicInput => Boolean(entry));
  const queryAnchors = anchors(request.query);
  const knownAnchors = new Set(inputs.flatMap((entry) => entry.anchors));
  const matchedAnchors = queryAnchors.filter((entry) => knownAnchors.has(entry));
  if (inputs.length !== refs.length || matchedAnchors.length === 0) return undefined;
  return { refs, inputs, matchedAnchors };
}

export default function lorelumExtension(pi: ExtensionAPI) {
  const condition = required("LORELUM_MOCK_CONDITION");
  const practicePath = required("LORELUM_MOCK_PRACTICE_PATH");
  const practiceSha256 = required("LORELUM_MOCK_PRACTICE_SHA256");
  const auditPath = required("LORELUM_MOCK_AUDIT_PATH");
  const docVersion = "mock-v2";
  const publicInputs = new Map<string, PublicInput>();
  const pendingReadPaths = new Map<string, string>();
  let discovered = false;
  let loaded = false;
  let queryRegistered = false;

  const audit = async (event: Record<string, unknown>): Promise<void> => {
    await appendFile(auditPath, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`);
  };
  const auditSafely = async (event: Record<string, unknown>): Promise<void> => {
    try { await audit(event); } catch { /* Telemetry must never fail an agent tool call. */ }
  };
  const behaviorConstraint = async (): Promise<string> => {
    const text = await readFile(practicePath, "utf8");
    const match = text.match(/##\s*建议[\s\S]*?^\d+\.\s*(.+)$/m);
    return match?.[1]?.trim() ?? "项目操作必须按来源与当前前台结果权威决定是否更新视图";
  };

  pi.on("tool_execution_start", async (event, ctx) => {
    try {
      const read = event as ReadEvent;
      if (read.toolName !== "read" || typeof read.toolCallId !== "string") return;
      const inputPath = readPathFromStart(read);
      if (!inputPath) return;
      const path = relativePublicPath(ctx.cwd, inputPath);
      if (path) pendingReadPaths.set(read.toolCallId, path);
    } catch {
      // Observation must not interfere with the agent's read tool.
    }
  });

  pi.on("tool_execution_end", async (event, ctx) => {
    try {
      const read = event as ReadEvent;
      if (read.toolName !== "read" || typeof read.toolCallId !== "string") return;
      const path = pendingReadPaths.get(read.toolCallId);
      pendingReadPaths.delete(read.toolCallId);
      if (read.isError || !path) return;
      const text = await readFile(resolve(ctx.cwd, path), "utf8");
      const value = { path, sha256: sha256(text), anchors: anchors(text) };
      publicInputs.set(path, value);
      await auditSafely({ event: "public_input_read", ...value });
    } catch {
      // Pi reports read failures; telemetry failures are deliberately silent.
    }
  });

  const registerQuery = () => {
    if (queryRegistered) return;
    queryRegistered = true;
    pi.registerTool({
      name: "policy_lookup",
      label: "Policy Lookup",
      description: "Query the loaded project policy entry using task-specific public evidence.",
      parameters: Type.Object({
        query: Type.String({ minLength: 1 }),
        public_refs: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
      }),
      async execute(toolCallId, params, _signal, _onUpdate, ctx) {
      if (!loaded) throw new Error("Open the project policy entry with docs_open before querying it.");
        const evidence = anchoredPublicInputs(ctx.cwd, params, publicInputs);
        if (!evidence) {
          await auditSafely({ event: "policy_query_rejected", query_id: toolCallId, query_sha256: sha256(params.query), public_refs: params.public_refs });
          throw new Error("policy_lookup requires public_refs already read by the agent and a query anchored to those inputs.");
        }
        const constraint = await behaviorConstraint();
        const scope = condition === "lorelum-retrieval" ? "前台项目操作与后台协调的结果权威" : "当前表单的提交前校验";
        const response = {
          query_id: toolCallId,
          scope_constraint: scope,
          matched_practice: {
            id: condition === "lorelum-retrieval" ? "react.project-operation-authority" : "react.form-validation",
            version: "v1",
            sha256: practiceSha256,
          },
          behavior_constraint: constraint,
        };
        await auditSafely({
          event: "policy_query_issued",
          query_id: toolCallId,
          query_sha256: sha256(params.query),
          public_refs: evidence.inputs.map(({ path, sha256: digest }) => ({ path, sha256: digest })),
          matched_anchors: evidence.matchedAnchors,
        });
        await auditSafely({
          event: "policy_query_resolved",
          query_id: toolCallId,
          practice_id: response.matched_practice.id,
          practice_version: response.matched_practice.version,
          practice_sha256: response.matched_practice.sha256,
          behavior_constraint_sha256: sha256(constraint),
        });
        return { content: [{ type: "text", text: JSON.stringify(response) }] };
      },
    });
  };

  pi.registerTool({
    name: "docs_search",
    label: "Search Project Policy Docs",
    description: "Search the project policy documentation library for policy references in files you have already read.",
    parameters: Type.Object({
      query: Type.String({ minLength: 1 }),
      public_refs: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
    }),
    async execute(toolCallId, params, _signal, _onUpdate, ctx) {
      await ensureInitialPublicInputs(ctx.cwd, publicInputs, auditSafely);
      const evidence = anchoredPublicInputs(ctx.cwd, params, publicInputs);
      if (!evidence) {
        await auditSafely({ event: "docs_discovery_rejected", tool_call_id: toolCallId, query_sha256: sha256(params.query) });
        throw new Error("docs_search requires public_refs already read by the agent and a query anchored to those inputs.");
      }
      discovered = true;
      await auditSafely({
        event: "docs_discovered",
        tool_call_id: toolCallId,
        doc_id: "project-policy",
        doc_version: docVersion,
        query_sha256: sha256(params.query),
        public_refs: evidence.inputs.map(({ path, sha256: digest }) => ({ path, sha256: digest })),
        matched_anchors: evidence.matchedAnchors,
      });
      return { content: [{ type: "text", text: "[{\"id\":\"project-policy\",\"version\":\"mock-v2\",\"summary\":\"Project policy reference guidance\"}]" }] };
    },
  });

  pi.registerTool({
    name: "docs_open",
    label: "Open Policy Doc Entry",
    description: "Open a project policy documentation entry returned by docs_search.",
    parameters: Type.Object({ id: Type.String({ minLength: 1 }) }),
    async execute(toolCallId, params) {
      if (!discovered || params.id !== "project-policy") throw new Error("Use docs_search and open the returned project policy entry.");
      loaded = true;
      registerQuery();
      await auditSafely({ event: "docs_opened", tool_call_id: toolCallId, doc_id: "project-policy", doc_version: docVersion });
      return { content: [{ type: "text", text: "Project policy doc opened. policy_lookup is now available." }] };
    },
  });
}
