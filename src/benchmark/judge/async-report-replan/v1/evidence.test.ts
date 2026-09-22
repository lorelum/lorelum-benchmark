import { describe, expect, test } from "bun:test";
import { assertReplanEvidenceIntegrity, projectReplanEvidence } from "./evidence";

function raw(overrides: Record<string, unknown> = {}) {
  return {
    blind_case_id: "case-a1b2c3d4e5f6",
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
    await expect(projectReplanEvidence(raw({ blind_case_id: "constraint-followup" }))).resolves.toMatchObject({ ok: false, state: "indeterminate" });
    for (const blindCaseId of ["reference", "equivalent", "anti-pattern", "cal-reference", "cal-equivalent", "cal-anti-pattern", "case-reference1234", "case-equiv1234567", "case-antipattern123", "case-calibration123", "case-condition1234"]) {
      await expect(projectReplanEvidence(raw({ blind_case_id: blindCaseId }))).resolves.toMatchObject({ ok: false, state: "indeterminate" });
    }
  });

  test("fails closed for credential-shaped secrets without relying on field names", async () => {
    for (const secret of [
      `ghp_${"a".repeat(36)}`,
      `sk-proj-${"b".repeat(32)}`,
      `AKIA${"C".repeat(16)}`,
      `xoxb-${"d".repeat(24)}`,
      `eyJ${"e".repeat(16)}.${"f".repeat(16)}.${"g".repeat(16)}`,
    ]) {
      const result = await projectReplanEvidence(raw({ final_candidate_diff: `diff --git a/src/report.ts b/src/report.ts\n+const value = "${secret}";\n` }));
      expect(result).toMatchObject({ ok: false, state: "indeterminate" });
      if (!result.ok) expect(result.reason).not.toContain(secret);
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

  test("does not treat shell wrappers or output commands as verification", async () => {
    for (const command of ["echo bun test", "printf bun test", "echo x && bun test", "node -e \\\"bun test\\\""]) {
      const result = await projectReplanEvidence(raw({ events: [
        { type: "message_end", message: { role: "assistant", stage: "initial", content: [{ type: "text", text: "initial" }] } },
        { type: "message_end", message: { role: "assistant", stage: "post-constraint", content: [{ type: "text", text: "post" }] } },
        { type: "tool_action", stage: "post-constraint", tool: "bash", args: { command }, status: "success", summary: "claimed verification" },
      ] }));
      expect(result).toMatchObject({ ok: false, state: "indeterminate" });
    }
  });

  test("does not accept a direct tool summary without a matching execution result", async () => {
    const result = await projectReplanEvidence(raw({ events: [
      { type: "message_end", message: { role: "assistant", stage: "initial", content: [{ type: "text", text: "initial" }] } },
      { type: "message_end", message: { role: "assistant", stage: "post-constraint", content: [{ type: "text", text: "post" }] } },
      { type: "tool_action", stage: "post-constraint", tool: "bash", args: { command: "bun test" }, status: "success", summary: "claimed verification" },
    ] }));
    expect(result).toMatchObject({ ok: false, state: "indeterminate" });
  });

  test("allows ordinary public domain words that are not private identity markers", async () => {
    const result = await projectReplanEvidence(raw({ public_user_turns: [{ stage: "initial", text: "Practice the public scoring workflow." }, { stage: "post-constraint", text: "Calibration is a public verification term here." }] }));
    expect(result.ok).toBe(true);
  });

  test("projects Pi assistant toolCall plus tool_result metadata without raw result content", async () => {
    const result = await projectReplanEvidence(raw({ events: [
      { type: "message_end", message: { role: "assistant", stage: "initial", content: [{ type: "text", text: "initial" }] } },
      { type: "message_end", message: { role: "assistant", stage: "post-constraint", content: [{ type: "text", text: "post" }, { type: "toolCall", id: "pi-1", name: "read", arguments: { path: "src/report.ts" } }] } },
      { type: "tool_result", id: "pi-1", isError: false, result: { raw: "do not forward" } },
      { type: "tool_execution_start", toolCallId: "t2", stage: "post-constraint", toolName: "bash", args: { command: "bun test" } },
      { type: "tool_execution_end", toolCallId: "t2", isError: false, result: { summary: "tests passed" } },
    ] }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.evidence.tool_actions[0]).toEqual({ order: 0, stage: "post-constraint", tool: "read", target: "src/report.ts", status: "success" });
      expect(result.evidence.verification_summaries).toHaveLength(1);
      expect(JSON.stringify(result.evidence)).not.toContain("do not forward");
    }
  });

  test("provider-facing evidence validation rejects nested extras and cap violations before scoring", async () => {
    const projected = await projectReplanEvidence(raw());
    expect(projected.ok).toBe(true);
    if (projected.ok) {
      const extra = structuredClone(projected.evidence) as Record<string, unknown>;
      (extra.assistant_stages as Array<Record<string, unknown>>)[0].unexpected = "reject";
      await expect(assertReplanEvidenceIntegrity(extra)).rejects.toThrow();
      const overCap = structuredClone(projected.evidence) as Record<string, unknown>;
      (overCap.assistant_stages as Array<Record<string, unknown>>)[0].text = "x".repeat(8001);
      await expect(assertReplanEvidenceIntegrity(overCap)).rejects.toThrow();
    }
  });
});
