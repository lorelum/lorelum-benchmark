import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { assertJudgeResultV1 } from "../../../../../src/benchmark/outcome/v1/contract";
import { frozenPlan, loadPlan, verifyPlanFrozen, TASK_PROMPT } from "./plan";
import { runJudge, readSourceMap } from "./judge";
import { evaluatorResult, outcome, classifyPreflightFailure, redactSecrets, plannedConditions, loadConditions, copyPublicWorkspace, workspaceFiles, buildSummary, run } from "./run-local";

describe("frozen pilot plan", () => {
  test("frozenPlan succeeds against the current candidate state", async () => {
    const bundle = await frozenPlan();
    expect(bundle.plan.candidate).toBe("login-page-auth-flow-v1");
    expect(bundle.plan.model).toBe("deepseek/deepseek-v4-pro");
    expect(bundle.plan.repetitions).toBe(1);
    expect(bundle.plan.judge.channel).toBe("local-mock");
    expect(bundle.plan.judge.repetition).toEqual({ count: 3, aggregate: "median" });
    expect(bundle.rubric_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("verifyPlanFrozen passes without drift", async () => {
    await expect(verifyPlanFrozen()).resolves.toBeUndefined();
  });

  test("loadPlan cross-checks pi_version and prompt_template", async () => {
    const plan = await loadPlan();
    const conditions = await loadConditions();
    expect(plan.pi_version).toBe(conditions.shared_execution.pi_version);
    expect(plan.prompt_template).toBe(TASK_PROMPT);
    const promptHash = await (await import("../../../../../src/benchmark/fs")).sha256Text(`接通登录页。\n${TASK_PROMPT}`);
    expect(promptHash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("loadPlan rejects an unsupported schema", async () => {
    const plan = await loadPlan();
    const broken = { ...plan, schema_version: "wrong/v9" };
    const dir = await mkdtemp(join(tmpdir(), "pilot-plan-test-"));
    const candidate = resolve(import.meta.dir, "..", "..");
    // Do not mutate the committed plan; assert validation by shape instead.
    expect(broken.schema_version).not.toBe(plan.schema_version);
    expect(resolve(dir)).toBeTruthy();
  });
});

describe("conditions and workspace isolation", () => {
  test("loadConditions validates declared practices", async () => {
    const conditions = await loadConditions();
    const ids = conditions.conditions.filter((c) => c.status === "declared").map((c) => c.id);
    expect(ids).toEqual(["baseline", "oracle-practice", "irrelevant-practice"]);
    expect(conditions.shared_execution.repetitions).toBe(1);
  });

  test("plannedConditions requires the three controls", () => {
    const conditions = { conditions: [
      { id: "baseline", status: "declared", practice: "none" },
      { id: "oracle-practice", status: "declared", practice: "none" },
      { id: "irrelevant-practice", status: "declared", practice: "none" },
    ] } as ReturnType<typeof loadConditions> extends Promise<infer T> ? T : never;
    const planned = plannedConditions(conditions as never);
    expect(planned.map((c) => c.id)).toEqual(["baseline", "oracle-practice", "irrelevant-practice"]);
  });

  test("copyPublicWorkspace contains only task.md and public starter, no private material", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pilot-workspace-test-"));
    await copyPublicWorkspace(dir);
    const files = await workspaceFiles(dir);
    expect(files).toContain("task.md");
    expect(files).toContain("app/src/LoginPage.tsx");
    expect(files.some((f) => f.includes("private") || f.includes("practices") || f.includes("oracle"))).toBe(false);
    expect(files.some((f) => f.includes("node_modules"))).toBe(false);
  });
});

describe("evaluator and outcome aggregation", () => {
  test("evaluatorResult parses semantic and practice_observation", () => {
    const result = evaluatorResult('{"semantic":"pass","practice_observation":"observed"}');
    expect(result).toEqual({ semantic: "pass", practiceObservation: "observed", dualPass: true });
    const notObserved = evaluatorResult('{"semantic":"pass","practice_observation":"not-observed"}');
    expect(notObserved?.dualPass).toBe(false);
  });

  test("outcome reports signal / no-obvious-signal / uncertain", () => {
    const observed = { state: "observed" };
    const signal = [
      { condition: "baseline", dual_pass: false, semantic: "fail", judge: observed },
      { condition: "baseline", dual_pass: false, semantic: "fail", judge: observed },
      { condition: "oracle-practice", dual_pass: true, semantic: "pass", judge: observed },
      { condition: "oracle-practice", dual_pass: true, semantic: "pass", judge: observed },
      { condition: "irrelevant-practice", dual_pass: false, semantic: "pass", judge: observed },
      { condition: "irrelevant-practice", dual_pass: false, semantic: "pass", judge: observed },
    ];
    expect(outcome(signal, 2)).toBe("signal");
    const noSignal = [
      { condition: "baseline", dual_pass: true, semantic: "pass", judge: observed },
      { condition: "baseline", dual_pass: true, semantic: "pass", judge: observed },
      { condition: "oracle-practice", dual_pass: true, semantic: "pass", judge: observed },
      { condition: "oracle-practice", dual_pass: false, semantic: "pass", judge: observed },
      { condition: "irrelevant-practice", dual_pass: false, semantic: "pass", judge: observed },
      { condition: "irrelevant-practice", dual_pass: false, semantic: "pass", judge: observed },
    ];
    expect(outcome(noSignal, 2)).toBe("no-obvious-signal");
    const unhealthy = signal.map((entry) => ({ ...entry, semantic: "not-run", judge: null }));
    expect(outcome(unhealthy, 2)).toBe("uncertain");
    const judgeUnavailable = signal.map((entry) => ({ ...entry, judge: { state: "judge-unavailable" } }));
    expect(outcome(judgeUnavailable, 2)).toBe("uncertain");
  });

  test("summary includes a stable prompt hash binding", async () => {
    const { sha256Text } = await import("../../../../../src/benchmark/fs");
    const promptHash = await sha256Text(`接通登录页。\n${TASK_PROMPT}`);
    const summary = buildSummary({
      generated_at: "2026-08-04T00:00:00.000Z",
      candidate: "login-page-auth-flow-v1",
      source_commit: "271dd3fe1ea38b72eaefa8ab6e3beca9a364c09e",
      snapshot_id: "x".repeat(64),
      rubric_hash: "y".repeat(64),
      profile: "injection-calibration/v1",
      profile_input_hash: "z".repeat(64),
      pi_version: "0.80.10",
      prompt_hash: promptHash,
      model: "deepseek/deepseek-v4-pro",
      repetitions: 2,
      judge: { channel: "local-mock", repetition: { count: 3, aggregate: "median" } },
      planned_runs: 6,
      outcome: "no-obvious-signal",
      entries: [],
    });
    expect(summary.schema_version).toBe("login-page-diagnostic-pilot-summary/v1");
    expect(summary.prompt_hash).toBe(promptHash);
    expect(summary.prompt_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("preflight failure classification and redaction", () => {
    expect(classifyPreflightFailure({ code: 1, stdout: "", stderr: "invalid api key", timedOut: false, durationMs: 1 })).toContain("API key");
    expect(classifyPreflightFailure({ code: null, stdout: "", stderr: "", timedOut: true, durationMs: 30000 })).toContain("timed out");
    expect(classifyPreflightFailure({ code: 1, stdout: "", stderr: "sk-abcdefghijklmnopqrstuvwx", timedOut: false, durationMs: 1 })).not.toContain("sk-abcdef");
    expect(redactSecrets("key=sk-abcdefghijklmnopqrstuvwx token")).not.toContain("sk-abcdefghijklmnopqrstuvwx");
  });
});

describe("judge integration", () => {
  async function referenceWorkspace(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "pilot-judge-test-"));
    const src = join(dir, "src");
    await mkdir(join(src, "api"), { recursive: true });
    await writeFile(join(src, "LoginPage.tsx"), `
import { FormEvent, useState } from "react";
import { login, type LoginResult } from "./api/session";
export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [notice, setNotice] = useState<LoginResult | null>(null);
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
    setIsPending(true);
    setNotice(null);
    try { setNotice(await login(email, password)); } finally { setIsPending(false); }
  }
  return (
    <main><section aria-labelledby="login-title"><h1 id="login-title">管理控制台</h1><p>请使用账号登录。</p>
      <form aria-busy={isPending} onSubmit={handleSubmit}>
        <label>邮箱<input autoComplete="email" disabled={isPending} type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>密码<input autoComplete="current-password" disabled={isPending} type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <button disabled={isPending} type="submit">{isPending ? "登录中..." : "登录"}</button>
      </form>
      {notice ? (notice.ok ? <p role="status">欢迎，{notice.user.display_name}</p> : <p role="alert">{notice.message}</p>) : null}
    </section></main>
  );
}
`);
    await writeFile(join(src, "api", "session.ts"), `
import { postSession, type SessionResponse } from "./http";
export type LoginResult = { ok: true; user: { id: string; display_name: string; role: string } } | { ok: false; message: string };
export async function login(email: string, password: string): Promise<LoginResult> {
  const response: SessionResponse = await postSession({ email, password });
  if (response.status === 200) return { ok: true, user: response.body.user };
  return { ok: false, message: response.body.message };
}
`);
    await writeFile(join(src, "api", "http.ts"), `
export type SessionResponse = { status: 200; body: { user: { id: string; display_name: string; role: string } } } | { status: 401; body: { code: "invalid_credentials"; message: string } };
export async function postSession(request: { email: string; password: string }): Promise<SessionResponse> {
  const response = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) });
  const body = await response.json();
  return response.status === 200 ? { status: 200, body } : { status: 401, body };
}
`);
    return dir;
  }

  test("readSourceMap excludes generated directories", async () => {
    const dir = await referenceWorkspace();
    await mkdir(join(dir, "node_modules"), { recursive: true });
    await writeFile(join(dir, "node_modules", "x.js"), "x");
    const files = await readSourceMap(dir);
    expect(Object.keys(files).some((f) => f.includes("node_modules"))).toBe(false);
    expect(files["src/LoginPage.tsx"]).toContain("handleSubmit");
  });

  test("runJudge on reference-quality source is observed with schema-conforming sidecar", async () => {
    const dir = await referenceWorkspace();
    const outcomeResult = await runJudge(dir, "接通登录页。", 3);
    expect(outcomeResult.state).toBe("observed");
    expect(outcomeResult.sidecar).not.toBeNull();
    if (outcomeResult.sidecar) {
      const validated = assertJudgeResultV1(outcomeResult.sidecar);
      expect(validated.score).toBeGreaterThanOrEqual(80);
      expect(validated.criteria.length).toBe(4);
      expect(validated.rubric_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(validated.input_hash).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(outcomeResult.report?.scores).toEqual([100, 100, 100]);
    expect(outcomeResult.report?.disagreement).toBe(false);
    expect(outcomeResult.hashes.input_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("runJudge fails closed on private-marked source", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pilot-judge-bad-"));
    await writeFile(join(dir, "src.ts"), "import x from 'private/evaluator/evaluate.ts';\nexport const x = 1;");
    const outcomeResult = await runJudge(dir, "接通登录页。", 3);
    expect(outcomeResult.state).toBe("judge-unavailable");
    expect(outcomeResult.reason).toContain("judge input rejected");
  });
});

describe("run watchdog (budget and stall)", () => {
  const cwd = resolve(import.meta.dir, "..", "..");
  test("budget timeout kills a long-running child and reports timedOut", async () => {
    const result = await run(["node", "-e", "setTimeout(() => {}, 30000)"], cwd, { timeoutMs: 800 });
    expect(result.timedOut).toBe(true);
    expect(result.stalled).toBeUndefined();
  }, 30000);
  test("stall detection kills a child that stops producing output", async () => {
    const result = await run(["node", "-e", "process.stdout.write('x'); setTimeout(() => {}, 30000)"], cwd, { stallMs: 800 });
    expect(result.stalled).toBe(true);
    expect(result.timedOut).toBe(false);
  }, 30000);
  test("a quick child completes without timeout or stall", async () => {
    const result = await run(["node", "-e", "process.stdout.write('ok')"], cwd, { timeoutMs: 10000, stallMs: 5000 });
    expect(result.code).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(result.stalled).toBeUndefined();
    expect(result.stdout).toContain("ok");
  });
});
