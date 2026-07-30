import { appendFile, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { createHash } from "node:crypto";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

type PublicInput = { path: string; sha256: string; anchors: string[] };

const condition = required("LORELUM_MOCK_CONDITION");
const practicePath = required("LORELUM_MOCK_PRACTICE_PATH");
const practiceSha256 = required("LORELUM_MOCK_PRACTICE_SHA256");
const auditPath = required("LORELUM_MOCK_AUDIT_PATH");
const skillVersion = "mock-v2";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function anchors(value: string): string[] {
  return [...new Set((value.toLowerCase().match(/[a-z_][a-z0-9_]{2,}|[\u4e00-\u9fff]{2,}/g) ?? [])
    .filter((token) => !["const", "return", "from", "type", "function", "window", "await"].includes(token)))]
    .slice(0, 64);
}

async function audit(event: Record<string, unknown>): Promise<void> {
  await appendFile(auditPath, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`);
}

async function behaviorConstraint(): Promise<string> {
  const text = await readFile(practicePath, "utf8");
  const match = text.match(/##\s*建议[\s\S]*?^\d+\.\s*(.+)$/m);
  return match?.[1]?.trim() ?? "组件的异步副作用应在卸载后失效";
}

function relativePublicPath(cwd: string, input: string): string | undefined {
  const resolved = resolve(cwd, input);
  const relativePath = relative(cwd, resolved).replaceAll("\\", "/");
  if (!relativePath || relativePath.startsWith("../") || relativePath === "..") return undefined;
  return relativePath;
}

export default function lorelumExtension(pi: ExtensionAPI) {
  const publicInputs = new Map<string, PublicInput>();
  let discovered = false;
  let loaded = false;
  let queryRegistered = false;

  pi.on("tool_execution_end", async (event, ctx) => {
    if (event.toolName !== "read" || event.isError) return;
    const input = event.args as { path?: unknown };
    if (typeof input.path !== "string") return;
    const path = relativePublicPath(ctx.cwd, input.path);
    if (!path) return;
    try {
      const text = await readFile(resolve(ctx.cwd, path), "utf8");
      const value = { path, sha256: sha256(text), anchors: anchors(text) };
      publicInputs.set(path, value);
      await audit({ event: "public_input_read", ...value });
    } catch {
      // Pi already reports read failures to the agent; failed reads are not evidence.
    }
  });

  const registerQuery = () => {
    if (queryRegistered) return;
    queryRegistered = true;
    pi.registerTool({
      name: "lorelum_query",
      label: "Lorelum Query",
      description: "Query the loaded Lorelum skill using task-specific public evidence.",
      parameters: Type.Object({
        query: Type.String({ minLength: 1 }),
        public_refs: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
      }),
      async execute(toolCallId, params, _signal, _onUpdate, ctx) {
        if (!loaded) throw new Error("Load Lorelum with skills_load before querying it.");
        const refs = params.public_refs.map((entry) => relativePublicPath(ctx.cwd, entry)).filter((entry): entry is string => Boolean(entry));
        const inputs = refs.map((entry) => publicInputs.get(entry)).filter((entry): entry is PublicInput => Boolean(entry));
        const queryAnchors = anchors(params.query);
        const knownAnchors = new Set(inputs.flatMap((entry) => entry.anchors));
        const matchedAnchors = queryAnchors.filter((entry) => knownAnchors.has(entry));
        if (inputs.length !== refs.length || matchedAnchors.length === 0) {
          await audit({ event: "practice_query_rejected", query_id: toolCallId, query_sha256: sha256(params.query), public_refs: refs });
          throw new Error("lorelum_query requires public_refs already read by the agent and a query anchored to those inputs.");
        }
        const constraint = await behaviorConstraint();
        const scope = condition === "lorelum-retrieval" ? "当前组件中的异步项目请求" : "当前表单的提交前校验";
        const response = {
          query_id: toolCallId,
          scope_constraint: scope,
          matched_practice: {
            id: condition === "lorelum-retrieval" ? "react.async-lifecycle" : "react.form-validation",
            version: "v1",
            sha256: practiceSha256,
          },
          behavior_constraint: constraint,
        };
        await audit({
          event: "practice_query_issued",
          query_id: toolCallId,
          query_sha256: sha256(params.query),
          public_refs: inputs.map(({ path, sha256: digest }) => ({ path, sha256: digest })),
          matched_anchors: matchedAnchors,
        });
        await audit({
          event: "practice_query_resolved",
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
    name: "skills_list",
    label: "Skill Directory",
    description: "List optional skills available for this coding task.",
    parameters: Type.Object({}),
    async execute(toolCallId) {
      discovered = true;
      await audit({ event: "skill_discovered", tool_call_id: toolCallId, skill_id: "lorelum", skill_version: skillVersion });
      return { content: [{ type: "text", text: "[{\"id\":\"lorelum\",\"version\":\"mock-v2\"}]" }] };
    },
  });

  pi.registerTool({
    name: "skills_load",
    label: "Load Skill",
    description: "Load a skill returned by skills_list.",
    parameters: Type.Object({ id: Type.String({ minLength: 1 }) }),
    async execute(toolCallId, params) {
      if (!discovered || params.id !== "lorelum") throw new Error("Use skills_list and load the returned Lorelum skill.");
      loaded = true;
      registerQuery();
      await audit({ event: "skill_loaded", tool_call_id: toolCallId, skill_id: "lorelum", skill_version: skillVersion });
      return { content: [{ type: "text", text: "Lorelum loaded. lorelum_query is now available." }] };
    },
  });
}
