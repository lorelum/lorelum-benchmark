import { expect, test } from "bun:test";
import { observeRetrieval } from "./retrieval";

const write = (content: string) => ({ type: "write", path: "support/request.txt", content });
const written = { type: "write", path: "support/request.txt" };
const command = { type: "command", index: 0 };
const result = (value: unknown) => ({ type: "command", index: 0, status: "completed", exitCode: 0, stdout: JSON.stringify(value) });

test("retains agent-selected query and actual empty versus installed outcomes", () => {
  const actions = [write("query\nuser-selected words\n"), command, { type: "done" }];
  const empty = observeRetrieval(actions, [written, result({ ok: true, data: { results: [] } })]);
  const installed = observeRetrieval(actions, [written, result({ ok: true, data: { results: [{ practiceId: "one" }] } })]);
  expect(empty).toEqual([{ operation: "query", request: "user-selected words", status: "empty", resultCount: 0, errorCode: null }]);
  expect(installed[0]?.status).toBe("success");
  expect(installed[0]?.resultCount).toBe(1);
});

test("distinguishes a missing Practice from an unobserved or truncated result", () => {
  const actions = [write("get\nexample.practice\n"), command, command];
  const events = observeRetrieval(actions, [written, result({ ok: false, error: { code: "practice.not-found" } }), { type: "command", index: 0, status: "truncated", exitCode: 0, stdout: "{" }]);
  expect(events.map(item => item.status)).toEqual(["not-found", "indeterminate"]);
  expect(events[0]?.request).toBe("example.practice");
});

test("does not attribute a request when its write was not observed", () => {
  const events = observeRetrieval([write("query\nnot-written\n"), command], [{ type: "read" }, result({ ok: true, data: { results: [] } })]);
  expect(events[0]?.operation).toBe("unknown");
  expect(events[0]?.request).toBeNull();
});

test("records an observed Lore error without treating it as a successful lookup", () => {
  const failure = { type: "command", index: 0, status: "failed", exitCode: 2, stdout: JSON.stringify({ ok: false, error: { code: "store.busy" } }) };
  const events = observeRetrieval([write("query\nx\n"), command], [written, failure]);
  expect(events[0]?.status).toBe("failed");
  expect(events[0]?.errorCode).toBe("store.busy");
});
