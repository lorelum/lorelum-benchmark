import { expect, test } from "bun:test";
import { auditPiJsonTrace, piJsonTraceArgs } from "./trace";
import type { RuleContext } from "./rule-router";
import type { TaskRuleAudit } from "./task-rule-audit";

const skill = '<skill name="vercel-react-best-practices" location="/lorelum/treatment/SKILL.md">instructions</skill>';
const memberHubRuleAudit: TaskRuleAudit = {
  manifestPath: "suites/contract-app/tasks/dashboard/v1/private/rule-audit.yaml",
  sha256: "0".repeat(64),
  treatment: { id: "vercel-skill", version: "v2" },
  requiredRules: ["async-dependencies.md", "async-parallel.md"]
};

function eventStream(userText: string, toolEvents: Record<string, unknown>[] = []): string {
  const events = [
    { type: "session", version: 3 },
    { type: "agent_start" },
    { type: "message_start", message: { role: "user", content: [{ type: "text", text: userText }] } },
    ...toolEvents,
    { type: "agent_end", messages: [] },
    { schema_version: "pi-run-result/v2", status: "completed" }
  ];
  return `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
}

function successfulRead(id: string, path: string): Record<string, unknown>[] {
  return [
    { type: "tool_execution_start", toolCallId: id, toolName: "read", args: { path } },
    { type: "tool_execution_end", toolCallId: id, toolName: "read", result: {}, isError: false }
  ];
}

function context(): RuleContext {
  const text = '<lorelum-rule-context schema="pi-rule-context/v1">\n<lorelum-rule path="rules/async-parallel.md" sha256="a">rule body</lorelum-rule>\n</lorelum-rule-context>';
  return { schema_version: "pi-rule-context/v1", router: { id: "public-bm25", version: "v1", maxRules: 3 }, public_input_sha256: "a".repeat(64), bundle_sha256: "b".repeat(64), rules: [{ path: "rules/async-parallel.md", sha256: "a".repeat(64), score: 1 }], sha256: new Bun.CryptoHasher("sha256").update(text).digest("hex"), text };
}

test("converts pinned Pi print mode into a JSON event stream", () => {
  expect(piJsonTraceArgs(["--model", "test", "--print", "--no-session"])).toEqual(["--model", "test", "--mode", "json", "--no-session"]);
  expect(() => piJsonTraceArgs(["--model", "test"])).toThrow("requires the pinned --print argument");
});

test("accepts a baseline trace without Skill access", () => {
  const audit = auditPiJsonTrace(eventStream("Implement the task"), { treatment: { id: "baseline", version: "v1" } }, memberHubRuleAudit);
  expect(audit.valid).toBe(true);
  expect(audit.skill_activated).toBe(false);
  expect(audit.rule_reads).toEqual([]);
  expect(audit.required_rules).toEqual([]);
});

test("accepts G1 only after every required task rule is successfully read before editing", () => {
  const events = [
    ...successfulRead("read-dependencies", "/lorelum/treatment/rules/async-dependencies.md"),
    ...successfulRead("read-parallel", "/lorelum/treatment/rules/async-parallel.md"),
    { type: "tool_execution_start", toolCallId: "edit-candidate", toolName: "edit", args: { path: "/workspace/starter/app/dashboard.ts" } }
  ];
  const audit = auditPiJsonTrace(eventStream(skill, events), { treatment: { id: "vercel-skill", version: "v2" } }, memberHubRuleAudit);
  expect(audit.valid).toBe(true);
  expect(audit.rule_reads).toEqual(["async-dependencies.md", "async-parallel.md"]);
  expect(audit.required_rules).toEqual(["async-dependencies.md", "async-parallel.md"]);
  expect(audit.first_edit_event).toBe(8);
  expect(audit.rule_read_events).toEqual([
    { rule: "async-dependencies.md", event_index: 5 },
    { rule: "async-parallel.md", event_index: 7 }
  ]);
});

test("rejects G1 when a required rule is missing or read after editing", () => {
  const missing = auditPiJsonTrace(eventStream(skill, successfulRead("read-dependencies", "/lorelum/treatment/rules/async-dependencies.md")), { treatment: { id: "vercel-skill", version: "v2" } }, memberHubRuleAudit);
  expect(missing.valid).toBe(false);
  expect(missing.failure_reason).toContain("every required task rule");

  const afterEdit = auditPiJsonTrace(eventStream(skill, [
    { type: "tool_execution_start", toolCallId: "edit-candidate", toolName: "edit", args: { path: "/workspace/starter/app/dashboard.ts" } },
    ...successfulRead("read-dependencies", "/lorelum/treatment/rules/async-dependencies.md"),
    ...successfulRead("read-parallel", "/lorelum/treatment/rules/async-parallel.md")
  ]), { treatment: { id: "vercel-skill", version: "v2" } }, memberHubRuleAudit);
  expect(afterEdit.valid).toBe(false);
  expect(afterEdit.rule_reads).toEqual([]);
});

test("rejects partial or failed reads and baseline rule access", () => {
  const partial = auditPiJsonTrace(eventStream(skill, [
    { type: "tool_execution_start", toolCallId: "read-dependencies", toolName: "read", args: { path: "/lorelum/treatment/rules/async-dependencies.md", limit: 10 } },
    { type: "tool_execution_end", toolCallId: "read-dependencies", toolName: "read", result: {}, isError: false }
  ]), { treatment: { id: "vercel-skill", version: "v2" } }, memberHubRuleAudit);
  expect(partial.valid).toBe(false);

  const baseline = auditPiJsonTrace(eventStream("Implement the task", successfulRead("read-parallel", "/lorelum/treatment/rules/async-parallel.md")), { treatment: { id: "baseline", version: "v1" } }, memberHubRuleAudit);
  expect(baseline.valid).toBe(false);
  expect(baseline.failure_reason).toContain("unexpectedly accessed");
});

test("accepts a control G1 trace without an irrelevant rule read", () => {
  const audit = auditPiJsonTrace(eventStream(skill), { treatment: { id: "vercel-skill", version: "v2" } });
  expect(audit.valid).toBe(true);
  expect(audit.required_rules).toEqual([]);
});

test("normalizes Windows rule paths from completed read events", () => {
  const audit = auditPiJsonTrace(eventStream(skill, successfulRead("read-dependencies", "D:\\artifacts\\treatment\\rules\\async-dependencies.md")), { treatment: { id: "vercel-skill", version: "v2" } }, {
    ...memberHubRuleAudit,
    requiredRules: ["async-dependencies.md"]
  });
  expect(audit.valid).toBe(true);
  expect(audit.rule_reads).toEqual(["async-dependencies.md"]);
});

test("rejects the old unexpanded newline-form Skill command", () => {
  const audit = auditPiJsonTrace(eventStream("/skill:vercel-react-best-practices\n\nImplement the task"), { treatment: { id: "vercel-skill", version: "v2" } }, memberHubRuleAudit);
  expect(audit.valid).toBe(false);
  expect(audit.failure_reason).toContain("not expanded");
});

test("accepts complete inline rule context and rejects a changed context", () => {
  const ruleContext = context();
  const valid = auditPiJsonTrace(eventStream(`${skill}\n${ruleContext.text}`), { treatment: { id: "vercel-skill", version: "v2" } }, memberHubRuleAudit, ruleContext);
  expect(valid.valid).toBe(true);
  expect(valid.rule_context_verified).toBe(true);
  const invalid = auditPiJsonTrace(eventStream(`${skill}\n${ruleContext.text.replace("rule body", "changed")}`), { treatment: { id: "vercel-skill", version: "v2" } }, memberHubRuleAudit, ruleContext);
  expect(invalid.valid).toBe(false);
  expect(invalid.failure_reason).toContain("rule context");
});

test("rejects an inline rule context in the baseline trace", () => {
  const audit = auditPiJsonTrace(eventStream(context().text), { treatment: { id: "baseline", version: "v1" } });
  expect(audit.valid).toBe(false);
  expect(audit.failure_reason).toContain("Baseline unexpectedly");
});
