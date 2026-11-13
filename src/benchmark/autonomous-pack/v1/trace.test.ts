import { describe, expect, test } from "bun:test";
import { auditTrace } from "./trace";
import { traceObservation } from "./summary";

const base = [{ type: "session", version: 3 }, { type: "agent_start" }];
const end = { type: "agent_end", messages: [{ role: "assistant", stopReason: "stop", content: [] }] };
const jsonl = (events: unknown[]) => events.map((event) => JSON.stringify(event)).join("\n") + "\n";
const trace = (...events: unknown[]) => jsonl([...base, ...events, end, { type: "agent_settled", aborted: false }]);
const wrap = (command: string, data: unknown, ok = true) => ({
  content: [{ type: "text", text: JSON.stringify({ protocolVersion: 2, toolVersion: "0.1.0-alpha.7", command, ok, data }) }],
  details: { exitCode: ok ? 0 : 2 }
});
const start = (id: string, toolName = "lore_query") => ({ type: "tool_execution_start", toolCallId: id, toolName, args: { query: "refund" } });
const finish = (id: string, result: unknown, toolName = "lore_query", isError = false) => ({ type: "tool_execution_end", toolCallId: id, toolName, result, isError });
const data = (results: unknown[]) => ({ mode: "semantic", coverage: "complete", results });
const found = { practiceId: "agentic-coding.example", contentDigest: "sha256:abc" };

describe("autonomous Pack Pi trace audit", () => {
  test("only a complete stream without query proves not-queried", () => {
    expect(auditTrace(trace()).query).toBe("not-queried");
    for (const input of ["", jsonl(base), jsonl([base[1], base[0], end]), trace() + "{", trace({ type: "unknown" })]) {
      expect(auditTrace(input).query).toBe("indeterminate");
    }
    expect(auditTrace(jsonl([...base, end])).query).toBe("indeterminate");
    expect(auditTrace(jsonl([...base, end, { type: "agent_settled", aborted: true }])).query).toBe("indeterminate");
    expect(auditTrace(jsonl([...base, { type: "agent_end", messages: [{ role: "assistant", stopReason: "length", content: [] }] }, { type: "agent_settled", aborted: false }])).query).toBe("indeterminate");
  });

  test("correlates query and get with their envelopes and line evidence", () => {
    const result = wrap("query", data([found]));
    const get = wrap("get", { practice: { id: found.practiceId }, contentDigest: found.contentDigest, sources: [] });
    const audit = auditTrace(trace(start("q"), finish("q", result), start("g", "lore_get"), finish("g", get, "lore_get")));
    expect(audit.complete).toBe(true);
    expect(audit.query).toBe("queried");
    expect(audit.calls).toEqual([
      { tool: "lore_query", id: "q", start_event: 3, end_event: 4, args: { query: "refund" }, result, status: "success" },
      { tool: "lore_get", id: "g", start_event: 5, end_event: 6, args: { query: "refund" }, result: get, status: "success" }
    ]);
  });

  test("distinguishes empty results, failure and mixed queries", () => {
    const empty = wrap("query", { ...data([]), empty: { reason: "corpus-empty" } });
    const failed = wrap("query", { message: "failed" }, false);
    expect(auditTrace(trace(start("q"), finish("q", empty))).query).toBe("queried-empty");
    expect(auditTrace(trace(start("q"), finish("q", failed))).query).toBe("query-failed");
    expect(auditTrace(trace(start("q"), finish("q", null, "lore_query", true))).query).toBe("query-failed");
    expect(auditTrace(trace(start("a"), finish("a", empty), start("b"), finish("b", wrap("query", data([found]))))).query).toBe("queried");
    expect(auditTrace(trace(start("a"), finish("a", empty), start("b"), finish("b", failed))).query).toBe("query-failed");
  });

  test("retains observed query outcomes despite shell uncertainty", () => {
    const shell = [start("shell", "bash"), finish("shell", {}, "bash")];
    const empty = auditTrace(trace(...shell, start("q"), finish("q", wrap("query", data([])))));
    const failed = auditTrace(trace(...shell, start("q"), finish("q", wrap("query", { message: "failed" }, false))));
    expect(empty.query).toBe("indeterminate");
    expect(failed.query).toBe("indeterminate");
    expect(traceObservation(empty)).toMatchObject({ complete: false, query: "indeterminate", query_success: 0, query_empty: 1, query_failed: 0, query_indeterminate: 0 });
    expect(traceObservation(failed)).toMatchObject({ complete: false, query: "indeterminate", query_success: 0, query_empty: 0, query_failed: 1, query_indeterminate: 0 });
    const mixed = auditTrace(trace(...shell, start("a"), finish("a", wrap("query", data([found]))), start("b"), finish("b", null), start("c")));
    expect(traceObservation(mixed)).toMatchObject({ query: "indeterminate", query_success: 1, query_empty: 0, query_failed: 0, query_indeterminate: 2 });
  });

  test("does not interpret absent, pending, mismatched or malformed responses as empty", () => {
    const invalid = [null, {}, wrap("get", data([])), wrap("query", { state: "preparing" }), wrap("query", { ...data([]), state: "indexing" }), wrap("query", { ...data([]), coverage: "partial" }), wrap("query", data([{}])), { content: [{ type: "text", text: "{" }] }];
    for (const result of invalid) expect(auditTrace(trace(start("q"), finish("q", result))).query).toBe("indeterminate");
    expect(auditTrace(trace(start("q"), { type: "tool_execution_end", toolCallId: "q", toolName: "lore_query", result: wrap("query", data([])) })).query).toBe("indeterminate");
    const conflictingExit = { ...wrap("query", data([])), details: { exitCode: 1 } };
    expect(auditTrace(trace(start("q"), finish("q", conflictingExit))).query).toBe("indeterminate");
  });

  test("rejects unfinished, unmatched, duplicate and announced-only calls", () => {
    const announce = { type: "message_end", message: { role: "assistant", content: [{ type: "toolCall", id: "q", name: "lore_query", arguments: {} }] } };
    for (const events of [
      [start("q")], [finish("q", wrap("query", data([])))], [start("q"), finish("q", wrap("query", data([])), "lore_get")],
      [start("q"), finish("q", wrap("query", data([]))), start("q")], [announce],
      [announce, start("q", "read"), finish("q", {}, "read")]
    ]) expect(auditTrace(trace(...events)).query).toBe("indeterminate");
  });

  test("get alone does not count as query, and incomplete other tools invalidate the trace", () => {
    expect(auditTrace(trace(start("g", "lore_get"), finish("g", wrap("get", {}), "lore_get"))).query).toBe("not-queried");
    expect(auditTrace(trace(start("read", "read"))).query).toBe("indeterminate");
    const shell = auditTrace(trace(start("shell", "bash"), finish("shell", {}, "bash")));
    expect(shell.query).toBe("indeterminate");
    expect(shell.errors).toContain("Shell access can invoke Lore outside the instrumented tools");
    expect(auditTrace(trace({ type: "message_end", message: { role: "assistant", stopReason: "error", content: [] } })).query).toBe("indeterminate");
  });
});
