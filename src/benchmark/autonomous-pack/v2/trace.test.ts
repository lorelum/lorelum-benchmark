import { describe, expect, test } from "bun:test";
import { traceObservation } from "../v1/summary";
import { auditTrace } from "./trace";

const base = [{ type: "session", version: 3 }, { type: "agent_start" }];
const end = { type: "agent_end", messages: [{ role: "assistant", stopReason: "stop", content: [] }] };
const settled = { type: "agent_settled", aborted: false };
const jsonl = (events: unknown[]) => events.map(event => JSON.stringify(event)).join("\n") + "\n";
const trace = (...events: unknown[]) => jsonl([...base, ...events, end, settled]);
const start = (id: string, toolName = "lore_query") => ({ type: "tool_execution_start", toolCallId: id, toolName, args: {} });
const finish = (id: string, toolName: string, result: unknown, isError = false) => ({ type: "tool_execution_end", toolCallId: id, toolName, result, isError });
const wrap = (command: string, data: unknown, ok = true) => ({
  content: [{ type: "text", text: JSON.stringify({ protocolVersion: 2, toolVersion: "test", command, ok, data }) }],
  details: { exitCode: ok ? 0 : 2 }
});
const query = (results: unknown[]) => wrap("query", { mode: "semantic", coverage: "complete", results });
const found = { practiceId: "example", contentDigest: "sha256:abc" };

describe("v2 trace audit", () => {
  test("reports complete structure and retrieval for ordinary traces", () => {
    expect(auditTrace(trace())).toMatchObject({ structure_complete: true, retrieval_complete: true, complete: true, query: "not-queried", errors: [] });
    for (const [result, expected] of [[query([]), "queried-empty"], [query([found]), "queried"], [wrap("query", {}, false), "query-failed"]] as const) {
      expect(auditTrace(trace(start("q"), finish("q", "lore_query", result)))).toMatchObject({
        structure_complete: true, retrieval_complete: true, complete: true, query: expected
      });
    }
  });

  test.each(["bash", "powershell"])("allows semantic evaluation with %s but preserves observed Lore counts", shell => {
    const input = trace(
      start("s", shell), finish("s", shell, {}),
      start("q1"), finish("q1", "lore_query", query([found])),
      start("q2"), finish("q2", "lore_query", query([])),
      start("q3"), finish("q3", "lore_query", wrap("query", {}, false)),
      start("q4"), finish("q4", "lore_query", {}),
      start("g", "lore_get"), finish("g", "lore_get", wrap("get", { practice: { id: "example" }, contentDigest: "sha256:abc", sources: [] }))
    );
    const audit = auditTrace(input);
    expect(audit).toMatchObject({ structure_complete: true, retrieval_complete: false, complete: false, query: "indeterminate" });
    expect(audit.calls.map(call => [call.tool, call.status])).toEqual([
      ["lore_query", "success"], ["lore_query", "empty"], ["lore_query", "failed"],
      ["lore_query", "indeterminate"], ["lore_get", "success"]
    ]);
    expect(traceObservation(audit)).toMatchObject({
      complete: false, query: "indeterminate", query_success: 1, query_empty: 1,
      query_failed: 1, query_indeterminate: 1, get_success: 1, get_failed: 0, get_indeterminate: 0
    });
  });

  test("rejects truncated, malformed, unpaired and unsuccessful runs as structurally incomplete", () => {
    const announced = { type: "message_end", message: { role: "assistant", content: [{ type: "toolCall", id: "missing", name: "read" }] } };
    const badEnd = { type: "agent_end", messages: [{ role: "assistant", stopReason: "error", content: [] }] };
    const cases = [
      "", jsonl(base), trace() + "{", trace({ type: "unknown" }),
      jsonl([...base, end]), jsonl([...base, end, { ...settled, aborted: true }]),
      jsonl([...base, badEnd, settled]), trace(start("s", "bash")),
      trace(finish("missing", "read", {})), trace(start("a", "read"), finish("a", "bash", {})),
      trace(start("a", "read"), finish("a", "read", {}), start("a", "read")), trace(announced)
    ];
    for (const input of cases) {
      const audit = auditTrace(input);
      expect(audit).toMatchObject({ structure_complete: false, retrieval_complete: false, complete: false, query: "indeterminate" });
      expect(audit.errors.length).toBeGreaterThan(0);
    }
  });

  test("an indeterminate Lore response does not imply a structurally incomplete stream", () => {
    const audit = auditTrace(trace(start("q"), finish("q", "lore_query", {})));
    expect(audit).toMatchObject({ structure_complete: true, retrieval_complete: true, complete: true, query: "indeterminate" });
    expect(audit.calls[0]).toMatchObject({ status: "indeterminate", start_event: 3, end_event: 4 });
  });
});
