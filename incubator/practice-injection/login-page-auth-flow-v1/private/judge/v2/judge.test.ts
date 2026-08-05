import { describe, expect, test } from "bun:test";
import { buildJudgeInput } from "../../../../../../src/benchmark/judge/input";
import { assertJudgeResultV1 } from "../../../../../../src/benchmark/outcome/v1/contract";
import { analyzePractice, scoreSourceV2, type SourceMap } from "./score";
import { assertRubric, loadRubric, rubricHash } from "./rubric";

const { text: rubricText, doc } = await loadRubric();
const taskMd = "把登录表单接到已有登录能力。\n";

function sourceMap(options: { alias?: boolean; duplicate?: boolean; antiPattern?: boolean; unrelated?: boolean } = {}): SourceMap {
  const operationImport = options.alias ? "import { login as authenticate } from './api/session';" : "import { login } from './api/session';";
  const operationName = options.alias ? "authenticate" : "login";
  const page = options.antiPattern
    ? `import { postSession } from './api/http';
export function LoginPage() {
  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    const response = await postSession({ email: 'a', password: 'b' });
    return response.status === 200 ? response.body : response.body;
  }
  return <form onSubmit={handleSubmit}><button type="submit">登录</button></form>;
}`
    : `${operationImport}
${options.unrelated ? "import { value } from './unrelated';" : ""}
export function LoginPage() {
  const [phase, setPhase] = useState<'idle' | 'pending'>('idle');
  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (phase === 'pending') { return; }
    setPhase('pending');
    try { await ${operationName}('a', 'b'); } finally { setPhase('idle'); }
  }
  return <form onSubmit={handleSubmit}><button disabled={phase === 'pending'} type="submit">登录</button></form>;
}`;
  const files: SourceMap = {
    "src/LoginPage.tsx": page,
    "src/api/session.ts": `import { postSession } from './http';
export async function login(email: string, password: string) {
  const response = await postSession({ email, password });
  if (response.status === 200) return { ok: true, user: response.body.user };
  return { ok: false, message: response.body.message };
}`,
    "src/api/http.ts": `export async function postSession(input: unknown) {
  const response = await fetch('/api/session', { method: 'POST', body: JSON.stringify(input) });
  const body = await response.json();
  return response.status === 200 ? { status: 200, body } : { status: 401, body };
}`,
  };
  if (options.unrelated) files["src/unrelated.ts"] = "export const value = 1;\n";
  if (options.duplicate) files["src/api/session/index.ts"] = "export const shadow = true;\n";
  return files;
}

describe("login Practice rubric v2", () => {
  test("has four Practice-specific dimensions totaling 100", () => {
    expect(doc.version).toBe("v2");
    expect(doc.dimensions.map((dimension) => dimension.id)).toEqual([
      "component-transport-isolation",
      "domain-operation-delegation",
      "boundary-response-translation",
      "raw-response-containment",
    ]);
    expect(doc.dimensions.reduce((sum, dimension) => sum + dimension.max_points, 0)).toBe(100);
    expect(() => assertRubric({ ...doc, version: "v1" })).toThrow();
  });

  test("equivalent aliases and intermediate pending expressions receive the same score", () => {
    const reference = analyzePractice(sourceMap());
    const renamed = analyzePractice(sourceMap({ alias: true, unrelated: true }));
    expect(reference.state).toBe("observed");
    expect(renamed.state).toBe("observed");
    expect(renamed.score).toBe(reference.score);
    expect(renamed.criteria.map(({ id, points }) => ({ id, points }))).toEqual(reference.criteria.map(({ id, points }) => ({ id, points })));
  });

  test("module-local operation aliases remain delegated", () => {
    const files = sourceMap();
    files["src/LoginPage.tsx"] = files["src/LoginPage.tsx"].replace("async function handleSubmit", "const performLogin = login;\n  async function handleSubmit").replace("await login('a', 'b')", "await performLogin('a', 'b')");
    const result = analyzePractice(files);
    expect(result.state).toBe("observed");
    expect(result.score).toBe(100);
  });

  test("multiple submit handlers sharing a module-level helper remain delegated", () => {
    const files = sourceMap();
    files["src/LoginPage.tsx"] = `import { login } from './api/session';
export function LoginPage() {
  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    await submitLogin();
  }
  async function handleSubmitAlt(event: SubmitEvent) {
    event.preventDefault();
    await submitLogin();
  }
  return <div><form onSubmit={handleSubmit}><button type="submit">登录</button></form><form onSubmit={handleSubmitAlt}><button type="submit">注册</button></form></div>;
}
async function submitLogin() {
  await login('a', 'b');
}`;
    const result = analyzePractice(files);
    expect(result.state).toBe("observed");
    expect(result.score).toBe(100);
    expect(result.criteria.find((criterion) => criterion.id === "domain-operation-delegation")?.points).toBe(25);
  });
  test("module-level helper aliases and object-method containers remain delegated", () => {
    const aliased = sourceMap();
    aliased["src/LoginPage.tsx"] = `import { login } from './api/session';
async function submitLogin() { await login('a', 'b'); }
const submit = submitLogin;
export function LoginPage() {
  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    await submit();
  }
  return <form onSubmit={handleSubmit}><button type="submit">登录</button></form>;
}`;
    const container = sourceMap();
    container["src/LoginPage.tsx"] = `import { login } from './api/session';
const actions = {
  submitLogin: async () => { await login('a', 'b'); },
};
export function LoginPage() {
  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    await actions.submitLogin();
  }
  return <form onSubmit={handleSubmit}><button type="submit">登录</button></form>;
}`;
    for (const files of [aliased, container]) {
      const result = analyzePractice(files);
      expect(result.state).toBe("observed");
      expect(result.score).toBe(100);
      expect(result.criteria.find((criterion) => criterion.id === "domain-operation-delegation")?.points).toBe(25);
    }
  });
  test("component transport anti-pattern is separated from the reference", () => {
    const reference = analyzePractice(sourceMap());
    const antiPattern = analyzePractice(sourceMap({ antiPattern: true }));
    expect(reference.score).toBe(100);
    expect(antiPattern.state).toBe("observed");
    expect(antiPattern.score).toBeLessThanOrEqual(doc.thresholds.anti_pattern_max);
    expect(reference.score - antiPattern.score).toBeGreaterThanOrEqual(doc.thresholds.anti_pattern_gap);
  });

  test("ambiguous local module graph fails closed", () => {
    const result = analyzePractice(sourceMap({ duplicate: true }));
    expect(result.state).toBe("indeterminate");
    expect(result.score).toBe(0);
    expect(result.reason).toContain("ambiguous");
  });

  test("unresolved alias fails closed", () => {
    const files = sourceMap();
    files["src/LoginPage.tsx"] = files["src/LoginPage.tsx"].replace("./api/session", "@/missing/session");
    const result = analyzePractice(files);
    expect(result.state).toBe("indeterminate");
    expect(result.reason).toContain("unresolved");
  });

  test("sidecar binds v2 rubric identity and hashes", async () => {
    const files = sourceMap();
    const candidateDiff = Object.entries(files).map(([path, content]) => `${path}\0${content}`).join("\n");
    const input = await buildJudgeInput({ task_md: taskMd, candidate_diff: candidateDiff, rubric: rubricText });
    const result = await scoreSourceV2({ files, taskMd, candidateDiff, rubricText, doc, inputHash: input.input_hash });
    const validated = assertJudgeResultV1(result);
    expect(validated.judge).toEqual({ id: "practice-layered-api", version: "2.0.0" });
    expect(validated.rubric_hash).toBe(await rubricHash(rubricText));
    expect(validated.criteria.map((criterion) => criterion.id)).toEqual([
      "component-transport-isolation",
      "domain-operation-delegation",
      "boundary-response-translation",
      "raw-response-containment",
    ]);
  });

  test("v2 judge input rejects private treatment and oracle markers", async () => {
    for (const candidateDiff of ["private/evaluator/evaluate.ts", "condition_id: oracle-practice", "private/practices/react.api.layered-design.v1.md"]) {
      await expect(buildJudgeInput({ task_md: taskMd, candidate_diff: candidateDiff, rubric: rubricText })).rejects.toThrow("judge input rejected");
    }
    const input = await buildJudgeInput({ task_md: taskMd, candidate_diff: "src/LoginPage.tsx\0export function LoginPage() { return <form />; }", rubric: rubricText });
    expect(input.input_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(input.material).toEqual([]);
  });
});
