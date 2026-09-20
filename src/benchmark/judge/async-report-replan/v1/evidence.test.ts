import { describe, expect, test } from "bun:test";
import { assertReplanEvidenceIntegrity, projectReplanEvidence } from "./evidence";

function raw(overrides: Record<string, unknown> = {}) {
  return {
    blind_case_id: "case-001",
    execution_health: "healthy",
    public_user_turns: [
      { stage: "initial", text: "Implement the report path." },
      { stage: "post-constraint", text: "The deployment constraint changed; replan." },
    ],
    events: [
      { type: "thinking", text: "private reasoning that must not appear" },
      { type: "message_end", message: { role: "assistant", stage: "initial", content: [{ type: "text", text: "I will inspect the current plan." }, { type: "thinking", text: "ignore this" }] } },
      { type: "tool_action", stage: "initial", tool: "read", args: { path: "src/report.ts" }, status: "success" },
      { type: "tool_result", result: { raw: "secret output" } },
      { type: "message_end", message: { role: "assistant", stage: "post-constraint", content: [{ type: "text", text: "The new constraint invalidates the original assumption, so I am revising scope and verification." }] } },
      { type: "tool_execution_start", toolCallId: "t1", stage: "post-constraint", toolName: "bash", args: { command: "bun test" } },
      { type: "tool_execution_end", toolCallId: "t1", isError: false, result: { summary: "4 tests passed" } },
    ],
    final_candidate_diff: "diff --git a/src/report.ts b/src/report.ts\n+export function report() {}\n",
    ...overrides,
  };
}

describe("replan evidence projection", () => {
  test("projects visible stages and safe tool metadata deterministically", async () => {
    const first = await projectReplanEvidence(raw());
    const second = await projectReplanEvidence(raw());
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.evidence).toEqual(second.evidence);
      expect(first.evidence.tool_actions).toEqual([
        { order: 0, stage: "initial", tool: "read", target: "src/report.ts", status: "success" },
        { order: 1, stage: "post-constraint", tool: "bash", target: "command:test", status: "success", summary: "4 tests passed", summary_sha256: expect.any(String) },
      ]);
      expect(JSON.stringify(first.evidence)).not.toContain("private reasoning");
      await assertReplanEvidenceIntegrity(first.evidence);
    }
  });

  test("drops thinking and raw tool results instead of forwarding them", async () => {
    const result = await projectReplanEvidence(raw());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(JSON.stringify(result.evidence)).not.toContain("secret output");
      expect(JSON.stringify(result.evidence)).not.toContain("thinking");
    }
  });

  test("fails closed for private markers, absolute paths, and condition fields", async () => {
    for (const value of [
      raw({ final_candidate_diff: "diff private/evaluator/source.ts" }),
      raw({ events: [{ type: "message_end", message: { role: "assistant", stage: "initial", content: [{ type: "text", text: "ok" }] } }, { type: "message_end", message: { role: "assistant", stage: "post-constraint", content: [{ type: "text", text: "ok" }] } }, { type: "tool_action", stage: "post-constraint", tool: "read", args: { path: "C:\\workspace\\src\\report.ts" }, status: "success" }] }),
      raw({ public_user_turns: [{ stage: "initial", text: "ok" }, { stage: "post-constraint", text: "condition_id: oracle" }] }),
    ]) {
      const result = await projectReplanEvidence(value);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).not.toContain("private/evaluator");
    }
  });

  test("fails closed for unknown tools, incomplete boundaries, and caps", async () => {
    await expect(projectReplanEvidence(raw({ events: [{ type: "message_end", message: { role: "assistant", stage: "initial", content: [{ type: "text", text: "a" }] } }, { type: "message_end", message: { role: "assistant", stage: "post-constraint", content: [{ type: "text", text: "b" }] } }, { type: "tool_action", stage: "post-constraint", tool: "write", args: { path: "x" }, status: "success" }] }))).resolves.toMatchObject({ ok: false, state: "indeterminate" });
    await expect(projectReplanEvidence(raw({ events: [{ type: "message_end", message: { role: "assistant", stage: "initial", content: [{ type: "text", text: "a" }] } }, { type: "message_end", message: { role: "assistant", stage: "post-constraint", content: [{ type: "text", text: "b" }] } }, { type: "tool_execution_start", toolCallId: "t1", stage: "post-constraint", toolName: "read", args: { path: "src/a.ts" } }] }))).resolves.toMatchObject({ ok: false, state: "indeterminate" });
    await expect(projectReplanEvidence(raw({ events: [{ type: "message_end", message: { role: "assistant", stage: "initial", content: [{ type: "text", text: "a" }] } }, { type: "message_end", message: { role: "assistant", stage: "post-constraint", content: [{ type: "text", text: "x".repeat(8001) }] } }] }))).resolves.toMatchObject({ ok: false, state: "indeterminate" });
  });

  test("normalizes test and typecheck commands without retaining raw commands", async () => {
    const result = await projectReplanEvidence(raw({ events: [
      { type: "message_end", message: { role: "assistant", stage: "initial", content: [{ type: "text", text: "initial" }] } },
      { type: "message_end", message: { role: "assistant", stage: "post-constraint", content: [{ type: "text", text: "post" }] } },
      { type: "tool_action", stage: "post-constraint", tool: "bash", args: { command: "bun run typecheck -- --secret=hidden" }, status: "success", summary: "typecheck passed" },
    ] }));
    expect(result.ok).toBe(false);
  });

  test("projects Pi assistant toolCall plus tool_result metadata without raw result content", async () => {
    const result = await projectReplanEvidence(raw({ events: [
      { type: "message_end", message: { role: "assistant", stage: "initial", content: [{ type: "text", text: "initial" }] } },
      { type: "message_end", message: { role: "assistant", stage: "post-constraint", content: [{ type: "text", text: "post" }, { type: "toolCall", id: "pi-1", name: "read", arguments: { path: "src/report.ts" } }] } },
      { type: "tool_result", id: "pi-1", isError: false, result: { raw: "do not forward" } },
    ] }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.evidence.tool_actions).toEqual([{ order: 0, stage: "post-constraint", tool: "read", target: "src/report.ts", status: "success" }]);
      expect(JSON.stringify(result.evidence)).not.toContain("do not forward");
    }
  });
});
