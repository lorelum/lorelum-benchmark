import type { TaskRuleAudit } from "./task-rule-audit";
import type { RuleContext } from "./rule-router";
import type { PiRunRequestV2 } from "./types";

type JsonRecord = Record<string, unknown>;

export type PiToolTimeoutEvent =
  | { type: "start"; toolCallId: string; timeoutMs: number }
  | { type: "end"; toolCallId: string };

export type PiTraceAudit = {
  schema_version: "pi-trace-audit/v1";
  treatment_id: string;
  parsed_events: number;
  event_types: string[];
  skill_activated: boolean;
  rule_reads: string[];
  required_rules: string[];
  first_edit_event: number | null;
  rule_read_events: Array<{ rule: string; event_index: number }>;
  rule_context_sha256?: string;
  rule_context_verified?: boolean;
  valid: boolean;
  failure_reason?: string;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function piToolTimeoutEvent(line: string): PiToolTimeoutEvent | undefined {
  try {
    const event = JSON.parse(line) as unknown;
    if (!isRecord(event) || typeof event.toolCallId !== "string") return undefined;
    if (event.type === "tool_execution_end" && event.toolName === "bash") return { type: "end", toolCallId: event.toolCallId };
    if (event.type !== "tool_execution_start" || event.toolName !== "bash" || !isRecord(event.args) || typeof event.args.timeout !== "number") return undefined;
    const timeoutSeconds = event.args.timeout;
    if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) return undefined;
    return { type: "start", toolCallId: event.toolCallId, timeoutMs: Math.ceil(timeoutSeconds * 1000) };
  } catch {
    return undefined;
  }
}

function messageText(value: unknown): string {
  if (!isRecord(value) || value.role !== "user" || !Array.isArray(value.content)) return "";
  return value.content
    .filter((entry): entry is JsonRecord => isRecord(entry) && entry.type === "text" && typeof entry.text === "string")
    .map((entry) => entry.text as string)
    .join("\n");
}

function eventMessages(event: JsonRecord): unknown[] {
  const messages: unknown[] = [];
  if (event.message !== undefined) messages.push(event.message);
  if (Array.isArray(event.messages)) messages.push(...event.messages);
  return messages;
}

function rulePath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replaceAll("\\", "/").replace(/\/+/g, "/");
  return /(?:^|\/)rules\/([a-z0-9-]+\.md)$/.exec(normalized)?.[1];
}

function isCompleteRead(event: JsonRecord): boolean {
  return event.toolName === "read" && isRecord(event.args) && typeof event.args.path === "string" && event.args.offset === undefined && event.args.limit === undefined;
}

export function piJsonTraceArgs(args: string[]): string[] {
  const printIndex = args.indexOf("--print");
  if (printIndex === -1) throw new Error("Pi execution requires the pinned --print argument before JSON trace conversion");
  return [...args.slice(0, printIndex), "--mode", "json", ...args.slice(printIndex + 1)];
}

export function auditPiJsonTrace(stdout: string, request: Pick<PiRunRequestV2, "treatment">, ruleAudit?: TaskRuleAudit, ruleContext?: RuleContext): PiTraceAudit {
  const events: JsonRecord[] = [];
  for (const line of stdout.split(/\r?\n/).filter(Boolean)) {
    try {
      const value = JSON.parse(line) as unknown;
      if (isRecord(value) && value.schema_version !== "pi-run-result/v2") events.push(value);
    } catch {
      return {
        schema_version: "pi-trace-audit/v1",
        treatment_id: request.treatment.id,
        parsed_events: events.length,
        event_types: [...new Set(events.map((event) => String(event.type ?? "unknown")))],
        skill_activated: false,
        rule_reads: [],
        required_rules: [],
        first_edit_event: null,
        rule_read_events: [],
        valid: false,
        failure_reason: "Pi stdout is not a complete JSON event stream"
      };
    }
  }

  const eventTypes = [...new Set(events.map((event) => String(event.type ?? "unknown")))];
  const userText = events.flatMap(eventMessages).map(messageText).join("\n");
  const skillActivated = userText.includes('<skill name="vercel-react-best-practices" location="');
  const ruleContextPresent = userText.includes("<lorelum-rule-context");
  const contextHash = ruleContext ? new Bun.CryptoHasher("sha256").update(ruleContext.text).digest("hex") : undefined;
  const contextVerified = ruleContext ? contextHash === ruleContext.sha256 && userText.includes(ruleContext.text) : undefined;
  const requiredRules = ruleAudit && request.treatment.id === ruleAudit.treatment.id && request.treatment.version === ruleAudit.treatment.version
    ? ruleAudit.requiredRules
    : [];
  const pendingReads = new Map<string, { rule: string }>();
  const completedReads: Array<{ rule: string; event_index: number }> = [];
  const attemptedReads = new Set<string>();
  let firstEditEvent: number | null = null;

  for (const [index, event] of events.entries()) {
    const eventIndex = index + 1;
    if (event.type === "tool_execution_start") {
      if ((event.toolName === "edit" || event.toolName === "write") && firstEditEvent === null) firstEditEvent = eventIndex;
      if (isCompleteRead(event)) {
        const rule = rulePath((event.args as JsonRecord).path);
        if (rule) {
          attemptedReads.add(rule);
          if (typeof event.toolCallId === "string") pendingReads.set(event.toolCallId, { rule });
        }
      }
    }
    if (event.type === "tool_execution_end" && event.toolName === "read" && typeof event.toolCallId === "string") {
      const pending = pendingReads.get(event.toolCallId);
      if (pending && event.isError !== true) completedReads.push({ rule: pending.rule, event_index: eventIndex });
      pendingReads.delete(event.toolCallId);
    }
  }

  const ruleReadEvents = completedReads.filter((read) => firstEditEvent === null || read.event_index < firstEditEvent);
  const ruleReads = [...new Set(ruleReadEvents.map((read) => read.rule))].sort();
  const complete = eventTypes.includes("session") && eventTypes.includes("agent_start") && eventTypes.includes("agent_end");
  let failureReason: string | undefined;
  if (!complete) failureReason = "Pi JSON event stream is incomplete";
  else if (request.treatment.id === "vercel-skill" && !skillActivated) failureReason = "Vercel Skill was not expanded into the G1 user message";
  else if (request.treatment.id === "vercel-skill" && ruleContext && !contextVerified) failureReason = "G1 rule context is missing or hash-mismatched in the expanded user message";
  else if (request.treatment.id === "vercel-skill" && !ruleContext && requiredRules.some((rule) => !ruleReads.includes(rule))) failureReason = "G1 did not successfully read every required task rule before the first edit";
  else if (request.treatment.id === "baseline" && (skillActivated || ruleContextPresent || attemptedReads.size > 0)) failureReason = "Baseline unexpectedly accessed the Vercel Skill";

  return {
    schema_version: "pi-trace-audit/v1",
    treatment_id: request.treatment.id,
    parsed_events: events.length,
    event_types: eventTypes,
    skill_activated: skillActivated,
    rule_reads: ruleReads,
    required_rules: requiredRules,
    first_edit_event: firstEditEvent,
    rule_read_events: ruleReadEvents,
    ...(ruleContext ? { rule_context_sha256: ruleContext.sha256, rule_context_verified: contextVerified } : {}),
    valid: failureReason === undefined,
    ...(failureReason ? { failure_reason: failureReason } : {})
  };
}
