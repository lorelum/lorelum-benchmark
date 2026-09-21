import { isAbsolute } from "node:path";
import { sha256Text } from "../../../fs";
import { absolutePathPattern, canonicalJson, containsSensitiveCredential, normalizeText, redactedProjectionReason } from "./canonical";
import type {
  AllowedTool,
  ProjectionResult,
  RawReplanAttempt,
  ReplanAssistantStage,
  ReplanEvidence,
  ReplanStage,
  ReplanToolAction,
  VerificationCategory,
  VerificationSummary,
} from "./types";

const issuedEvidence = new WeakSet<object>();

function issueReplanEvidence<T extends ReplanEvidence>(evidence: T): T {
  issuedEvidence.add(evidence);
  return evidence;
}

export function isReplanEvidenceIssued(value: unknown): value is ReplanEvidence {
  return Boolean(value) && typeof value === "object" && issuedEvidence.has(value as object);
}

const allowedTools = new Set<AllowedTool>(["read", "ls", "grep", "edit", "bash"]);
const stages: ReplanStage[] = ["initial", "post-constraint"];
const stageSet = new Set(stages);
const stageCap = 8_000;
const toolMetadataCap = 20_000;
const verificationCap = 10_000;
const diffCap = 120_000;
const summaryCap = 2_000;

const forbiddenContent = [
  /\bprivate[\\/]/i,
  /\boracle[\\/]/i,
  /\b(?:condition[_ -]?id|delivery[_ -]?node|timing(?:[_ -]?assignment|[_ -]?node)?)\b/i,
  /\b(?:pack|practice)[ _-](?:id|ref|payload|provenance|body|text)\b/i,
  /\b(?:session[_ -]?id|session identity)\b/i,
  /\b(?:system|developer) prompt\b/i,
  /\b(?:api[_ -]?key|authorization|credential|password|secret|access[_ -]?token)\b/i,
  absolutePathPattern,
  /\b(?:evaluator|oracle)[ _-]?(?:version|status|check(?:s)?|expectation|fixture|source|id|ref)\b/i,
  /\b(?:scoring|calibration)[ _-]?(?:expectation|config|fixture|identity|result|status|hash|source)\b/i,
];

type RecordValue = Record<string, unknown>;

class ProjectionFailure extends Error {}

function record(value: unknown): RecordValue | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : undefined;
}

function fail(reason: string): never {
  throw new ProjectionFailure(reason);
}

function containsForbiddenContent(value: string): boolean {
  return forbiddenContent.some((pattern) => pattern.test(value)) || containsSensitiveCredential(value);
}

function stringField(value: unknown, label: string): string {
  if (typeof value !== "string") fail(`${label} is missing or not text`);
  return value;
}

function safeText(value: string, label: string): string {
  const normalized = normalizeText(value);
  if (containsForbiddenContent(normalized)) fail(`${label} contains forbidden material`);
  return normalized;
}

function safeDiff(value: string): string {
  const normalized = value.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  if (containsForbiddenContent(normalized)) fail("final candidate diff contains forbidden material");
  if (normalized.length > diffCap) fail("final candidate diff exceeds the v1 cap");
  return normalized;
}

function stageOf(value: unknown, label: string): ReplanStage {
  if (value !== "initial" && value !== "post-constraint") fail(`${label} has no complete stage boundary`);
  return value;
}

function validBlindCaseId(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value) || containsForbiddenContent(value) || /(?:condition|delivery|timing)/i.test(value) || /^(?:baseline|oracle|retrieval|irrelevant|task-start|constraint-followup|first-implementation-checkpoint)$/i.test(value)) fail("blind_case_id is not an opaque safe identifier");
  return value;
}

function isAbsoluteOrEscaping(value: string): boolean {
  return isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value) || /^\\\\/.test(value) || value.split(/[\\/]+/).includes("..");
}

function safeRelativePath(value: unknown, label: string): string {
  const raw = stringField(value, label).replaceAll("\\", "/").trim();
  if (!raw || raw.length > 512 || isAbsoluteOrEscaping(raw) || containsForbiddenContent(raw)) fail(`${label} is not a safe relative path`);
  const normalized = raw.split("/").filter((part) => part && part !== ".").join("/") || ".";
  if (!normalized || normalized.startsWith("../") || normalized === "..") fail(`${label} escapes the public workspace`);
  return normalized;
}

function commandCategory(command: string): VerificationCategory | undefined {
  const normalized = command.trim().toLowerCase().replaceAll("\\", "/");
  if (!normalized || /[;&|<>`$()\r\n]/.test(normalized)) return undefined;
  const tokens = normalized.split(/\s+/);
  const executable = tokens[0];
  if (["vitest", "jest", "pytest"].includes(executable)) return "test";
  if (executable === "tsc" || executable === "tsc.exe") return "typecheck";
  if (!["bun", "npm", "pnpm", "yarn"].includes(executable)) return undefined;
  const commandIndex = tokens[1] === "run" ? 2 : 1;
  const script = tokens[commandIndex];
  if (["test", "check", "lint"].some((name) => script === name || script.startsWith(`${name}:`))) return "test";
  if (["typecheck", "check-types"].includes(script)) return "typecheck";
  return undefined;
}

function bashTarget(args: RecordValue): { target: string; category?: VerificationCategory } {
  const command = stringField(args.command, "bash.command");
  if (!command.trim() || isAbsoluteOrEscaping(command) || containsForbiddenContent(command)) fail("bash command is not a safe command category");
  const category = commandCategory(command);
  return { target: category ? `command:${category}` : "command:other", category };
}

function toolTarget(tool: AllowedTool, args: RecordValue): { target: string; category?: VerificationCategory } {
  if (tool === "bash") return bashTarget(args);
  return { target: safeRelativePath(args.path ?? args.target, `${tool}.path`) };
}

function toolName(value: unknown): AllowedTool {
  if (typeof value !== "string" || !allowedTools.has(value as AllowedTool)) fail(`unknown or unallowlisted tool: ${String(value)}`);
  return value as AllowedTool;
}

function statusOf(value: RecordValue, label: string): "success" | "failure" {
  if (value.status === "success" || value.status === "failure") return value.status;
  if (typeof value.isError === "boolean") return value.isError ? "failure" : "success";
  if (typeof value.ok === "boolean") return value.ok ? "success" : "failure";
  fail(`${label} has no safe execution status`);
}

type AssistantToolCall = { id: string; stage: ReplanStage; tool: AllowedTool; args: RecordValue };

function textFromContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  const pieces: string[] = [];
  for (const part of value) {
    const item = record(part);
    if (!item) continue;
    if (item.type === "text" && typeof item.text === "string") pieces.push(item.text);
    // Thinking and raw tool results are deliberately discarded at the boundary.
  }
  return pieces.join("");
}

function stageTextMap(): Map<ReplanStage, string[]> {
  return new Map(stages.map((stage) => [stage, []]));
}

function addAssistantMessage(event: RecordValue, stageText: Map<ReplanStage, string[]>): AssistantToolCall[] {
  const message = record(event.message) ?? event;
  if (message.role === "system" || message.role === "developer") fail("system/developer content is not projection input");
  if (message.role !== "assistant") return [];
  const stage = stageOf(event.stage ?? message.stage, "assistant message");
  const text = safeText(textFromContent(message.content ?? message.text), "assistant text");
  if (text) stageText.get(stage)?.push(text);
  const calls: AssistantToolCall[] = [];
  if (Array.isArray(message.content)) {
    for (const part of message.content) {
      const item = record(part);
      if (!item || !["toolCall", "tool_use", "tool-call"].includes(String(item.type))) continue;
      const id = stringField(item.id ?? item.toolCallId, "assistant tool call id");
      const tool = toolName(item.name ?? item.tool ?? item.toolName);
      calls.push({ id, stage, tool, args: record(item.arguments ?? item.args) ?? {} });
    }
  }
  return calls;
}

type PendingTool = { order: number; stage: ReplanStage; tool: AllowedTool; target: string; category?: VerificationCategory };

function addSummary(summary: unknown, label: string, category: VerificationCategory | undefined): string | undefined {
  if (!category || summary === undefined) return undefined;
  const text = safeText(stringField(summary, label), label);
  if (text.length > summaryCap) fail(`${label} exceeds the per-summary cap`);
  return text;
}

function directToolAction(event: RecordValue, order: number): { action: ReplanToolAction; verification?: VerificationSummary } {
  const stage = stageOf(event.stage, "tool action");
  const tool = toolName(event.tool ?? event.toolName ?? event.name);
  const args = record(event.args ?? event.arguments) ?? {};
  const targetInfo = toolTarget(tool, args);
  const status = statusOf(event, "tool action");
  if (targetInfo.category && event.summary !== undefined) fail("verification summary requires a matching execution result");
  return { action: { order, stage, tool, target: targetInfo.target, status } };
}

async function failureHash(reason: string): Promise<string> {
  return sha256Text(canonicalJson({ schema_version: "replan-evidence/v1", state: "indeterminate", reason: redactedProjectionReason(reason) }));
}

function exactKeys(value: RecordValue, allowed: string[], label: string): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) fail(`${label} contains unsupported fields`);
}

export async function projectReplanEvidence(input: unknown): Promise<ProjectionResult> {
  try {
    const root = record(input);
    if (!root) fail("attempt must be an object");
    exactKeys(root, ["blind_case_id", "execution_health", "public_user_turns", "events", "final_candidate_diff"], "attempt");
    const blindCaseId = validBlindCaseId(stringField(root.blind_case_id, "blind_case_id"));
    if (root.execution_health !== "healthy" && root.execution_health !== "unhealthy") fail("execution_health is invalid");
    if (!Array.isArray(root.public_user_turns) || root.public_user_turns.length !== 2) fail("exactly two public user turns are required");
    const publicTurns = root.public_user_turns.map((raw, index) => {
      const item = record(raw);
      if (!item) fail(`public user turn ${index} is invalid`);
      exactKeys(item, ["stage", "text"], `public user turn ${index}`);
      const stage = stageOf(item.stage, `public user turn ${index}`);
      const text = safeText(stringField(item.text, `public user turn ${index}.text`), `public user turn ${index}.text`);
      if (!text || text.length > stageCap) fail(`public user turn ${index} is missing or exceeds the cap`);
      return { stage, text };
    });
    if (publicTurns[0].stage !== "initial" || publicTurns[1].stage !== "post-constraint") fail("public user turns do not establish the two required stages");
    if (!Array.isArray(root.events)) fail("events are missing");
    const stageText = stageTextMap();
    const actions: ReplanToolAction[] = [];
    const verification: VerificationSummary[] = [];
    const pending = new Map<string, PendingTool>();
    let order = 0;
    for (const raw of root.events) {
      const event = record(raw);
      if (!event) fail("event is not a structured object");
      if (event.type === "message" || event.type === "message_end" || event.role === "assistant" || event.role === "user" || event.role === "system" || event.role === "developer") {
        for (const call of addAssistantMessage(event, stageText)) {
          if (!pending.has(call.id)) {
            const targetInfo = toolTarget(call.tool, call.args);
            pending.set(call.id, { order: order++, stage: call.stage, tool: call.tool, target: targetInfo.target, category: targetInfo.category });
          }
        }
        continue;
      }
      if (event.type === "thinking" || event.type === "toolResult" || event.type === "session" || event.type === "model_change" || event.type === "thinking_level_change") continue;
      if (event.type === "tool_action") {
        const result = directToolAction(event, order++);
        if (result.action.summary) {
          result.action.summary_sha256 = await sha256Text(result.action.summary);
          result.verification!.summary_sha256 = result.action.summary_sha256;
        }
        actions.push(result.action);
        if (result.verification) verification.push(result.verification);
        continue;
      }
      if (event.type === "tool_call" || event.type === "tool_execution_start") {
        const id = stringField(event.toolCallId ?? event.id, `${event.type}.id`);
        if (pending.has(id)) continue;
        const stage = stageOf(event.stage, `${event.type} stage`);
        const tool = toolName(event.tool ?? event.toolName ?? event.name);
        const targetInfo = toolTarget(tool, record(event.args ?? event.arguments) ?? {});
        pending.set(id, { order: order++, stage, tool, target: targetInfo.target, category: targetInfo.category });
        continue;
      }
      if (event.type === "tool_execution_end") {
        const id = stringField(event.toolCallId ?? event.id, "tool_execution_end.id");
        const started = pending.get(id);
        if (!started) fail("tool execution ended without a matching call");
        pending.delete(id);
        const status = statusOf(event, "tool execution");
        const result = record(event.result);
        const summary = addSummary(result?.summary, "tool verification summary", started.category);
        const action: ReplanToolAction = { order: started.order, stage: started.stage, tool: started.tool, target: started.target, status, ...(summary ? { summary, summary_sha256: await sha256Text(summary) } : {}) };
        actions.push(action);
        if (summary && started.category) verification.push({ order: started.order, stage: started.stage, command_category: started.category, summary, summary_sha256: action.summary_sha256! });
        continue;
      }
      if (event.type === "tool_result") {
        const rawId = event.toolCallId ?? event.toolUseId ?? event.id;
        if (typeof rawId !== "string") continue;
        const id = rawId;
        const started = pending.get(id);
        if (!started) continue;
        pending.delete(id);
        const status = statusOf(event, "tool result");
        const result = record(event.result);
        const summary = addSummary(result?.summary, "tool verification summary", started.category);
        const action: ReplanToolAction = { order: started.order, stage: started.stage, tool: started.tool, target: started.target, status, ...(summary ? { summary, summary_sha256: await sha256Text(summary) } : {}) };
        actions.push(action);
        if (summary && started.category) verification.push({ order: started.order, stage: started.stage, command_category: started.category, summary, summary_sha256: action.summary_sha256! });
        continue;
      }
      if (event.type === "tool") fail("unknown tool event shape");
      if (typeof event.type === "string" && event.type.startsWith("tool")) fail("unknown tool event shape");
      if ("tool" in event || "toolName" in event || "toolCallId" in event) fail("unknown tool event shape");
      // Unknown non-tool metadata is ignored; it cannot enter evidence.
    }
    if (pending.size > 0) fail("tool execution boundary is incomplete");
    const assistantStages: ReplanAssistantStage[] = [];
    for (const stage of stages) {
      const text = safeText(stageText.get(stage)?.join("\n") ?? "", `${stage} assistant text`);
      if (!text || text.length > stageCap) fail(`${stage} assistant stage is missing or exceeds the cap`);
      assistantStages.push({ stage, text, text_sha256: await sha256Text(text) });
    }
    actions.sort((a, b) => a.order - b.order);
    verification.sort((a, b) => a.order - b.order);
    if (canonicalJson(actions).length > toolMetadataCap) fail("tool metadata exceeds the v1 cap");
    if (verification.reduce((sum, item) => sum + item.summary.length, 0) > verificationCap) fail("verification summaries exceed the v1 cap");
    const finalDiff = safeDiff(stringField(root.final_candidate_diff, "final_candidate_diff"));
    const evidenceWithoutHash = {
      schema_version: "replan-evidence/v1" as const,
      blind_case_id: blindCaseId,
      execution_health: root.execution_health,
      public_user_turns: await Promise.all(publicTurns.map(async (turn) => ({ ...turn, text_sha256: await sha256Text(turn.text) }))),
      assistant_stages: assistantStages,
      tool_actions: actions,
      verification_summaries: verification,
      final_candidate_diff: finalDiff,
      final_candidate_diff_sha256: await sha256Text(finalDiff),
    };
    const evidenceHash = await sha256Text(canonicalJson(evidenceWithoutHash));
    const evidence = { ...evidenceWithoutHash, evidence_hash: evidenceHash } as ReplanEvidence;
    assertReplanEvidence(evidence);
    return { ok: true, evidence: issueReplanEvidence(evidence) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, state: "indeterminate", reason: redactedProjectionReason(reason), evidence_hash: await failureHash(reason) };
  }
}

export function assertReplanEvidence(value: unknown): asserts value is ReplanEvidence {
  const root = record(value);
  if (!root || root.schema_version !== "replan-evidence/v1") throw new Error("replan evidence schema_version is invalid");
  exactKeys(root, ["schema_version", "blind_case_id", "execution_health", "public_user_turns", "assistant_stages", "tool_actions", "verification_summaries", "final_candidate_diff", "final_candidate_diff_sha256", "evidence_hash"], "replan evidence");
  validBlindCaseId(stringField(root.blind_case_id, "blind_case_id"));
  if (root.execution_health !== "healthy" && root.execution_health !== "unhealthy") throw new Error("replan evidence execution_health is invalid");
  if (!Array.isArray(root.public_user_turns) || root.public_user_turns.length !== 2 || !Array.isArray(root.assistant_stages) || root.assistant_stages.length !== 2 || !Array.isArray(root.tool_actions) || !Array.isArray(root.verification_summaries) || typeof root.final_candidate_diff !== "string") throw new Error("replan evidence shape is incomplete");
  const hashPattern = /^[a-f0-9]{64}$/;
  for (const [index, item] of root.public_user_turns.entries()) {
    const turn = record(item);
    if (!turn) throw new Error(`public user turn ${index} is invalid`);
    exactKeys(turn, ["stage", "text", "text_sha256"], `public user turn ${index}`);
    if (!stageSet.has(turn.stage as ReplanStage) || typeof turn.text !== "string" || !turn.text || turn.text.length > stageCap || typeof turn.text_sha256 !== "string" || !hashPattern.test(turn.text_sha256)) throw new Error(`public user turn ${index} violates the v1 schema`);
  }
  for (const [index, item] of root.assistant_stages.entries()) {
    const stage = record(item);
    if (!stage) throw new Error(`assistant stage ${index} is invalid`);
    exactKeys(stage, ["stage", "text", "text_sha256"], `assistant stage ${index}`);
    if (!stageSet.has(stage.stage as ReplanStage) || typeof stage.text !== "string" || !stage.text || stage.text.length > stageCap || typeof stage.text_sha256 !== "string" || !hashPattern.test(stage.text_sha256)) throw new Error(`assistant stage ${index} violates the v1 schema`);
  }
  for (const [index, item] of root.tool_actions.entries()) {
    const action = record(item);
    if (!action) throw new Error(`tool action ${index} is invalid`);
    exactKeys(action, ["order", "stage", "tool", "target", "status", "summary", "summary_sha256"], `tool action ${index}`);
    if (!Number.isInteger(action.order) || action.order < 0 || !stageSet.has(action.stage as ReplanStage) || !allowedTools.has(action.tool as AllowedTool) || typeof action.target !== "string" || !action.target || action.target.length > 512 || action.status !== "success" && action.status !== "failure") throw new Error(`tool action ${index} violates the v1 schema`);
    if (action.tool === "bash") {
      if (!/^command:(?:test|typecheck|other)$/.test(action.target)) throw new Error(`tool action ${index} has an invalid command category`);
    } else {
      if (safeRelativePath(action.target, `tool action ${index}.target`) !== action.target) throw new Error(`tool action ${index} path is not normalized`);
    }
    if (action.summary !== undefined && (typeof action.summary !== "string" || action.summary.length > summaryCap || typeof action.summary_sha256 !== "string" || !hashPattern.test(action.summary_sha256))) throw new Error(`tool action ${index} summary violates the v1 schema`);
    if (action.summary === undefined && action.summary_sha256 !== undefined) throw new Error(`tool action ${index} has an orphan summary hash`);
  }
  if (root.tool_actions.length === 0 || root.verification_summaries.length === 0) throw new Error("replan evidence is missing required tool or verification evidence");
  for (const [index, item] of root.verification_summaries.entries()) {
    const summary = record(item);
    if (!summary) throw new Error(`verification summary ${index} is invalid`);
    exactKeys(summary, ["order", "stage", "command_category", "summary", "summary_sha256"], `verification summary ${index}`);
    if (!Number.isInteger(summary.order) || summary.order < 0 || !stageSet.has(summary.stage as ReplanStage) || summary.command_category !== "test" && summary.command_category !== "typecheck" || typeof summary.summary !== "string" || !summary.summary || summary.summary.length > summaryCap || typeof summary.summary_sha256 !== "string" || !hashPattern.test(summary.summary_sha256)) throw new Error(`verification summary ${index} violates the v1 schema`);
  }
  const publicTurnStages = root.public_user_turns.map((item) => record(item)?.stage);
  const assistantStages = root.assistant_stages.map((item) => record(item)?.stage);
  if (JSON.stringify(publicTurnStages) !== JSON.stringify(stages) || JSON.stringify(assistantStages) !== JSON.stringify(stages)) throw new Error("replan evidence stage boundaries are invalid");
  if (root.final_candidate_diff.length > diffCap || root.tool_actions.some((item) => !record(item) || !allowedTools.has(record(item)!.tool as AllowedTool) || !stageSet.has(record(item)!.stage as ReplanStage)) || root.verification_summaries.some((item) => !record(item) || !stageSet.has(record(item)!.stage as ReplanStage))) throw new Error("replan evidence contains an invalid action or summary");
  if (canonicalJson(root.tool_actions).length > toolMetadataCap || root.verification_summaries.reduce((sum, item) => sum + (typeof record(item)?.summary === "string" ? String(record(item)?.summary).length : 0), 0) > verificationCap) throw new Error("replan evidence exceeds a v1 cap");
  if (containsForbiddenContent(canonicalJson(root))) throw new Error("replan evidence contains forbidden material");
  if (!/^[a-f0-9]{64}$/.test(stringField(root.final_candidate_diff_sha256, "final_candidate_diff_sha256")) || !/^[a-f0-9]{64}$/.test(stringField(root.evidence_hash, "evidence_hash"))) throw new Error("replan evidence hashes are invalid");
}

export async function assertReplanEvidenceIntegrity(value: unknown): Promise<ReplanEvidence> {
  assertReplanEvidence(value);
  const evidence = value as ReplanEvidence;
  for (const turn of evidence.public_user_turns) if (turn.text_sha256 !== await sha256Text(turn.text)) throw new Error("public user turn hash mismatch");
  for (const stage of evidence.assistant_stages) if (stage.text_sha256 !== await sha256Text(stage.text)) throw new Error("assistant stage hash mismatch");
  for (const action of evidence.tool_actions) if (action.summary !== undefined && action.summary_sha256 !== await sha256Text(action.summary)) throw new Error("tool summary hash mismatch");
  for (const summary of evidence.verification_summaries) if (summary.summary_sha256 !== await sha256Text(summary.summary)) throw new Error("verification summary hash mismatch");
  if (evidence.final_candidate_diff_sha256 !== await sha256Text(evidence.final_candidate_diff)) throw new Error("candidate diff hash mismatch");
  const { evidence_hash: _ignored, ...withoutHash } = evidence;
  if (evidence.evidence_hash !== await sha256Text(canonicalJson(withoutHash))) throw new Error("evidence hash mismatch");
  return evidence;
}

export { forbiddenContent, safeRelativePath };
