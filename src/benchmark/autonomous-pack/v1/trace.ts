type JsonRecord = Record<string, unknown>;

export type QueryAudit = "not-queried" | "queried-empty" | "queried" | "query-failed" | "indeterminate";
export type LoreCall = {
  tool: "lore_query" | "lore_get";
  id: string;
  start_event: number;
  end_event: number | null;
  args: unknown;
  result: unknown;
  status: "success" | "empty" | "failed" | "indeterminate";
};
export type TraceAudit = {
  complete: boolean;
  query: QueryAudit;
  calls: LoreCall[];
  errors: string[];
};

function record(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// The extension returns the CLI envelope as a single Pi text content block.
function envelope(result: unknown, command: "query" | "get"): JsonRecord | undefined {
  if (!record(result) || !Array.isArray(result.content) || result.content.length !== 1) return undefined;
  const block = result.content[0];
  if (!record(block) || block.type !== "text" || typeof block.text !== "string") return undefined;
  try {
    const parsed: unknown = JSON.parse(block.text);
    if (!record(parsed) || parsed.protocolVersion !== 2 || typeof parsed.toolVersion !== "string" || parsed.command !== command || typeof parsed.ok !== "boolean") return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function callStatus(tool: LoreCall["tool"], event: JsonRecord): LoreCall["status"] {
  if (event.isError === true) return "failed";
  if (event.isError !== false) return "indeterminate";
  const value = envelope(event.result, tool === "lore_query" ? "query" : "get");
  if (!value) return "indeterminate";
  if (!record(event.result) || !record(event.result.details) || typeof event.result.details.exitCode !== "number") return "indeterminate";
  if (value.ok === false) return event.result.details.exitCode === 0 ? "indeterminate" : "failed";
  if (event.result.details.exitCode !== 0 || !record(value.data)) return "indeterminate";
  if (tool === "lore_get") {
    return record(value.data.practice) && typeof value.data.practice.id === "string" &&
      typeof value.data.contentDigest === "string" && Array.isArray(value.data.sources) ? "success" : "indeterminate";
  }
  if (value.data.state === "preparing" || value.data.state === "indexing" || value.data.mode !== "semantic" || value.data.coverage !== "complete" || !Array.isArray(value.data.results)) return "indeterminate";
  if (value.data.results.some((item) => !record(item) || typeof item.practiceId !== "string" || !item.practiceId || typeof item.contentDigest !== "string" || !item.contentDigest)) return "indeterminate";
  return value.data.results.length === 0 ? "empty" : "success";
}

const eventTypes: Record<string, true> = {
  session: true, agent_start: true, agent_end: true, agent_settled: true, turn_start: true, turn_end: true,
  message_start: true, message_update: true, message_end: true,
  tool_execution_start: true, tool_execution_update: true, tool_execution_end: true
};

/** Audit one Pi --mode json stdout stream. Event indices are one-based JSONL line numbers. */
export function auditTrace(stdout: string): TraceAudit {
  const errors: string[] = [];
  const calls: LoreCall[] = [];
  const starts = new Map<string, { name: string; call?: LoreCall }>();
  const seen = new Map<string, string>();
  const announced = new Map<string, string>();
  let phase: "before" | "session" | "running" | "ended" = "before";
  let settled = false;
  const lines = stdout.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    const eventIndex = index + 1;
    let event: unknown;
    try { event = JSON.parse(line); } catch { errors.push(`Invalid JSON at line ${eventIndex}`); continue; }
    if (!record(event)) { errors.push(`Invalid event at line ${eventIndex}`); continue; }
    if (event.schema_version === "pi-run-result/v2") {
      if (phase !== "ended" || event.status !== "completed") errors.push(`Invalid run result at line ${eventIndex}`);
      continue;
    }
    if (typeof event.type !== "string" || !Object.hasOwn(eventTypes, event.type)) { errors.push(`Unknown event at line ${eventIndex}`); continue; }
    if (event.type === "session") {
      if (phase !== "before") errors.push(`Unexpected session at line ${eventIndex}`);
      else phase = "session";
      continue;
    }
    if (event.type === "agent_start") {
      if (phase !== "session") errors.push(`Unexpected agent_start at line ${eventIndex}`);
      else phase = "running";
      continue;
    }
    if (event.type === "agent_end") {
      if (!Array.isArray(event.messages)) errors.push(`Missing agent messages at line ${eventIndex}`);
      const assistants = Array.isArray(event.messages) ? event.messages.filter(message => record(message) && message.role === "assistant") : [];
      const finalAssistant = assistants.at(-1);
      if (!record(finalAssistant) || finalAssistant.stopReason !== "stop") errors.push(`Missing completed assistant response at line ${eventIndex}`);
      if (Array.isArray(event.messages)) for (const message of event.messages) {
        if (!record(message) || message.role !== "assistant") continue;
        if (message.stopReason === "error" || message.stopReason === "aborted" || message.stopReason === "length") errors.push(`Assistant did not complete at line ${eventIndex}`);
        if (Array.isArray(message.content)) for (const part of message.content) {
          if (!record(part) || part.type !== "toolCall") continue;
          if (typeof part.id !== "string" || !part.id || typeof part.name !== "string" || !part.name || (announced.has(part.id) && announced.get(part.id) !== part.name)) {
            errors.push(`Invalid announced tool call at line ${eventIndex}`);
          } else announced.set(part.id, part.name);
        }
      }
      if (phase !== "running") errors.push(`Unexpected agent_end at line ${eventIndex}`);
      else phase = "ended";
      continue;
    }
    if (event.type === "agent_settled") {
      if (phase !== "ended" || settled || event.aborted !== false) errors.push(`Invalid agent_settled at line ${eventIndex}`);
      else settled = true;
      continue;
    }
    if (phase !== "running") errors.push(`Event outside agent run at line ${eventIndex}`);
    if (event.type === "message_end" && record(event.message) && event.message.role === "assistant") {
      if (event.message.stopReason === "error" || event.message.stopReason === "aborted" || event.message.stopReason === "length") errors.push(`Assistant did not complete at line ${eventIndex}`);
      if (Array.isArray(event.message.content)) for (const part of event.message.content) {
        if (!record(part) || part.type !== "toolCall") continue;
        if (typeof part.id !== "string" || !part.id || typeof part.name !== "string" || !part.name || announced.has(part.id)) {
          errors.push(`Invalid announced tool call at line ${eventIndex}`);
        } else announced.set(part.id, part.name);
      }
    }
    if (event.type === "tool_execution_start") {
      if (typeof event.toolCallId !== "string" || !event.toolCallId || typeof event.toolName !== "string" || !event.toolName || seen.has(event.toolCallId)) {
        errors.push(`Invalid tool start at line ${eventIndex}`);
        continue;
      }
      seen.set(event.toolCallId, event.toolName);
      if (event.toolName === "bash" || event.toolName === "powershell") {
        errors.push("Shell access can invoke Lore outside the instrumented tools");
      }
      let call: LoreCall | undefined;
      if (event.toolName === "lore_query" || event.toolName === "lore_get") {
        call = { tool: event.toolName, id: event.toolCallId, start_event: eventIndex, end_event: null, args: event.args ?? null, result: null, status: "indeterminate" };
        calls.push(call);
      }
      starts.set(event.toolCallId, { name: event.toolName, call });
    } else if (event.type === "tool_execution_update") {
      const start = typeof event.toolCallId === "string" ? starts.get(event.toolCallId) : undefined;
      if (!start || event.toolName !== start.name) errors.push(`Unmatched tool update at line ${eventIndex}`);
    } else if (event.type === "tool_execution_end") {
      const start = typeof event.toolCallId === "string" ? starts.get(event.toolCallId) : undefined;
      if (!start || event.toolName !== start.name) { errors.push(`Unmatched tool end at line ${eventIndex}`); continue; }
      starts.delete(event.toolCallId as string);
      if (start.call) {
        start.call.end_event = eventIndex;
        start.call.result = event.result ?? null;
        start.call.status = callStatus(start.call.tool, event);
      }
    }
  }
  if (phase !== "ended") errors.push("Missing session, agent_start, or agent_end");
  if (!settled) errors.push("Missing successful agent_settled");
  if (starts.size) errors.push("Unfinished tool calls");
  for (const [id, name] of announced) {
    if (!seen.has(id)) errors.push(`Announced tool call ${id} did not start`);
    else if (seen.get(id) !== name) errors.push(`Tool name mismatch for ${id}`);
  }
  const complete = errors.length === 0;
  const queries = calls.filter((call) => call.tool === "lore_query");
  let query: QueryAudit;
  if (!complete || queries.some((call) => call.status === "indeterminate")) query = "indeterminate";
  else if (!queries.length) query = "not-queried";
  else if (queries.some((call) => call.status === "failed")) query = "query-failed";
  else if (queries.some((call) => call.status === "success")) query = "queried";
  else query = "queried-empty";
  return { complete, query, calls, errors };
}
