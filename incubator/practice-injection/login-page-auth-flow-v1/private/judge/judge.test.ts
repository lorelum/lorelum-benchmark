import { describe, expect, test } from "bun:test";
import { buildJudgeInput } from "../../../../../src/benchmark/judge/input";
import { assertJudgeResultV1 } from "../../../../../src/benchmark/outcome/v1/contract";
import { mockContext, mockJudgeProvider } from "../../../../../src/benchmark/judge/mock";
import { loadRubric, assertRubric, rubricHash, assertNoPathBinding } from "./rubric";
import { scoreDimensions, scoreSource } from "./score";
import { aggregateRuns, median } from "./aggregate";
import type { SourceMap } from "./score";

const { text: rubricText, doc } = await loadRubric();

const publicTask = "登录页现在是死的，点了没反应。后端登录接口已经通了，前端 session.ts 里也有封装，你把它接到表单上。\n";

function referenceSource(): SourceMap {
  return {
    "src/LoginPage.tsx": `
import { FormEvent, useState } from "react";
import { login, type LoginResult } from "./api/session";
export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<LoginResult | null>(null);
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setNotice(null);
    try { setNotice(await login(email, password)); } finally { setSubmitting(false); }
  }
  return (
    <main><section aria-labelledby="login-title"><h1 id="login-title">管理控制台</h1><p>请使用账号登录。</p>
      <form aria-busy={submitting} onSubmit={handleSubmit}>
        <label>邮箱<input autoComplete="email" disabled={submitting} type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>密码<input autoComplete="current-password" disabled={submitting} type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <button disabled={submitting} type="submit">{submitting ? "登录中..." : "登录"}</button>
      </form>
      {notice ? (notice.ok ? <p role="status">欢迎，{notice.user.display_name}</p> : <p role="alert">{notice.message}</p>) : null}
    </section></main>
  );
}
`,
    "src/api/session.ts": `
import { postSession, type SessionResponse } from "./http";
export type LoginResult = { ok: true; user: { id: string; display_name: string; role: string } } | { ok: false; message: string };
export async function login(email: string, password: string): Promise<LoginResult> {
  const response: SessionResponse = await postSession({ email, password });
  if (response.status === 200) return { ok: true, user: response.body.user };
  return { ok: false, message: response.body.message };
}
`,
    "src/api/http.ts": `
export type SessionResponse = { status: 200; body: { user: { id: string; display_name: string; role: string } } } | { status: 401; body: { code: "invalid_credentials"; message: string } };
export async function postSession(request: { email: string; password: string }): Promise<SessionResponse> {
  const response = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) });
  const body = await response.json();
  return response.status === 200 ? { status: 200, body } : { status: 401, body };
}
`,
  };
}

function antiPatternSource(): SourceMap {
  return {
    "src/LoginPage.tsx": `
import { FormEvent, useState } from "react";
import { postSession } from "./api/http";
export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await postSession({ email, password });
    if (response.status === 401) { alert(response.body.message); return; }
    alert(\`欢迎，\${response.body.user.display_name}\`);
  }
  return (
    <main><section aria-labelledby="login-title"><h1 id="login-title">管理控制台</h1><p>请使用账号登录。</p>
      <form onSubmit={handleSubmit}>
        <label>邮箱<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>密码<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <button type="submit">登录</button>
      </form>
    </section></main>
  );
}
`,
    "src/api/http.ts": `
export type SessionResponse = { status: 200; body: { user: { id: string; display_name: string; role: string } } } | { status: 401; body: { code: "invalid_credentials"; message: string } };
export async function postSession(request: { email: string; password: string }): Promise<SessionResponse> {
  const response = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) });
  const body = await response.json();
  return response.status === 200 ? { status: 200, body } : { status: 401, body };
}
`,
  };
}

describe("login-page rubric conformance", () => {
  test("dimensions, points, thresholds, and path independence are valid", async () => {
    expect(doc.id).toBe("login-page-judge-rubric");
    expect(doc.version).toBe("v1");
    expect(doc.dimensions.map((d) => d.id)).toEqual(["api-page-boundary", "state-handling", "form-experience", "ui-ux"]);
    expect(doc.dimensions.reduce((sum, d) => sum + d.max_points, 0)).toBe(100);
    expect(doc.thresholds.reference_min).toBeGreaterThan(doc.thresholds.anti_pattern_max);
    expect(doc.repetition.count).toBeGreaterThanOrEqual(1);
    expect(doc.repetition.aggregate).toBe("median");
    expect(() => assertNoPathBinding(rubricText)).not.toThrow();
    expect(() => assertRubric({ ...doc, dimensions: [{ id: "api-page-boundary", max_points: 100, description: "ok" }] })).toThrow();
  });

  test("rubric hash is stable", async () => {
    const first = await rubricHash(rubricText);
    const second = await rubricHash(rubricText);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).toBe(second);
  });
});

describe("judge input redaction", () => {
  test("public-only input builds a valid allowlisted bundle", async () => {
    const input = await buildJudgeInput({ task_md: publicTask, candidate_diff: "diff --git a/src/LoginPage.tsx b/src/LoginPage.tsx\n+export function LoginPage() { return <form />; }\n", rubric: rubricText });
    expect(input.input_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("private markers fail closed", async () => {
    for (const bad of ["private/evaluator/evaluate.ts", "condition_id: oracle-practice", "private/practices/react.api.layered-design.v1.md", "private/calibration/fixtures.yaml"]) {
      await expect(buildJudgeInput({ task_md: publicTask, candidate_diff: bad, rubric: rubricText })).rejects.toThrow("judge input rejected");
    }
  });
});

describe("mock provider schema conformance for login-page rubric", () => {
  test("repo mock provider returns a provenance-complete result for login-page rubric input", async () => {
    const input = await buildJudgeInput({ task_md: publicTask, candidate_diff: "diff --git a/src/LoginPage.tsx b/src/LoginPage.tsx\n+export function LoginPage() { return <form />; }\n", rubric: rubricText });
    const context = await mockContext(input);
    const result = await mockJudgeProvider.score(input, context);
    const validated = assertJudgeResultV1(result);
    expect(validated.state).toBe("observed");
    expect(result.rubric_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.criteria.reduce((sum, c) => sum + c.points, 0)).toBe(result.score);
    expect(result.criteria.every((c) => c.rationale && c.rationale.length > 0)).toBe(true);
  });
});

describe("deterministic rubric scorer", () => {
  test("reference-quality source scores high and anti-pattern source scores lower", async () => {
    const reference = scoreDimensions(referenceSource());
    const antiPattern = scoreDimensions(antiPatternSource());
    const referenceTotal = reference.reduce((sum, c) => sum + c.points, 0);
    const antiPatternTotal = antiPattern.reduce((sum, c) => sum + c.points, 0);
    expect(referenceTotal).toBeGreaterThanOrEqual(doc.thresholds.reference_min);
    expect(antiPatternTotal).toBeLessThanOrEqual(doc.thresholds.anti_pattern_max);
    expect(referenceTotal - antiPatternTotal).toBeGreaterThanOrEqual(doc.thresholds.anti_pattern_gap);
    const boundary = reference.find((c) => c.id === "api-page-boundary");
    const boundaryAnti = antiPattern.find((c) => c.id === "api-page-boundary");
    expect(boundary?.points).toBe(30);
    expect(boundaryAnti?.points).toBeLessThan(30);
    expect(boundaryAnti?.rationale).toContain("raw transport response");
  });

  test("scorer output is schema conforming with complete provenance", async () => {
    const files = referenceSource();
    const candidateDiff = Object.entries(files).map(([path, content]) => `${path}\0${content}`).join("\n");
    const input = await buildJudgeInput({ task_md: publicTask, candidate_diff: candidateDiff, rubric: rubricText });
    const result = await scoreSource({ files, taskMd: publicTask, candidateDiff, rubricText, doc, inputHash: input.input_hash });
    const validated = assertJudgeResultV1(result);
    expect(validated.judge).toEqual({ id: "mock-judge", version: "0.1.0" });
    expect(validated.input_hash).toBe(input.input_hash);
    expect(validated.rubric_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(validated.prompt_hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("repetition aggregation", () => {
  test("median and spread are computed", () => {
    expect(median([80, 90, 100])).toBe(90);
    expect(median([70, 80])).toBe(75);
  });

  test("identical runs aggregate to observed without disagreement", () => {
    const runs = [1, 2, 3].map(() => ({ score: 90, confidence: 100, criteria: [{ id: "api-page-boundary", points: 30, max_points: 30, rationale: "ok" }] }));
    const aggregate = aggregateRuns(runs, doc.thresholds);
    expect(aggregate.state).toBe("observed");
    expect(aggregate.score).toBe(90);
    expect(aggregate.report.disagreement).toBe(false);
    expect(aggregate.report.spread).toBe(0);
  });

  test("divergent runs are reported as disagreement with per-run scores", () => {
    const runs = [
      { score: 70, confidence: 100, criteria: [] },
      { score: 80, confidence: 100, criteria: [] },
      { score: 90, confidence: 100, criteria: [] },
    ];
    const aggregate = aggregateRuns(runs, doc.thresholds);
    expect(aggregate.state).toBe("indeterminate");
    expect(aggregate.score).toBe(0);
    expect(aggregate.report.disagreement).toBe(true);
    expect(aggregate.report.spread).toBe(20);
    expect(aggregate.reason).toContain("[70, 80, 90]");
  });

  test("low confidence is flagged", () => {
    const runs = [
      { score: 90, confidence: 60, criteria: [] },
      { score: 90, confidence: 100, criteria: [] },
      { score: 90, confidence: 100, criteria: [] },
    ];
    const aggregate = aggregateRuns(runs, doc.thresholds);
    expect(aggregate.report.lowConfidence).toBe(true);
  });
});

describe("review fixes: naming and import independence", () => {
  function renamedStateSource(): SourceMap {
    return {
      "src/LoginPage.tsx": `
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
`,
      "src/api/session.ts": `
import { postSession, type SessionResponse } from "./http";
export type LoginResult = { ok: true; user: { id: string; display_name: string; role: string } } | { ok: false; message: string };
export async function login(email: string, password: string): Promise<LoginResult> {
  const response: SessionResponse = await postSession({ email, password });
  if (response.status === 200) return { ok: true, user: response.body.user };
  return { ok: false, message: response.body.message };
}
`,
      "src/api/http.ts": `
export type SessionResponse = { status: 200; body: { user: { id: string; display_name: string; role: string } } } | { status: 401; body: { code: "invalid_credentials"; message: string } };
export async function postSession(request: { email: string; password: string }): Promise<SessionResponse> {
  const response = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) });
  const body = await response.json();
  return response.status === 200 ? { status: 200, body } : { status: 401, body };
}
`,
    };
  }

  function aliasImportSource(): SourceMap {
    return {
      "src/LoginPage.tsx": `
import { FormEvent, useState } from "react";
import { login, type LoginResult } from "@/api/session";
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
`,
    };
  }

  test("renamed state variables stay within tolerance of reference", () => {
    const reference = scoreDimensions(referenceSource());
    const renamed = scoreDimensions(renamedStateSource());
    const referenceTotal = reference.reduce((sum, c) => sum + c.points, 0);
    const renamedTotal = renamed.reduce((sum, c) => sum + c.points, 0);
    expect(renamedTotal).toBeGreaterThanOrEqual(doc.thresholds.reference_min);
    expect(Math.abs(referenceTotal - renamedTotal)).toBeLessThanOrEqual(doc.thresholds.equivalent_tolerance);
  });

  test("aliased boundary import is not penalized", () => {
    const aliased = scoreDimensions(aliasImportSource());
    const boundary = aliased.find((c) => c.id === "api-page-boundary");
    expect(boundary?.points).toBe(30);
    const total = aliased.reduce((sum, c) => sum + c.points, 0);
    expect(total).toBeGreaterThanOrEqual(doc.thresholds.reference_min);
  });
});
