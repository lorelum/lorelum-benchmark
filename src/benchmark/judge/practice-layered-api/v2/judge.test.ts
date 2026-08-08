import { describe, expect, test } from "bun:test";
import { buildJudgeInput } from "../../../judge/input";
import { assertJudgeResultV1 } from "../../../outcome/v1/contract";
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

  test("two-layer boundary that owns fetch translates identically to the reference", () => {
    const files = sourceMap();
    files["src/api/session.ts"] = `export async function login(email: string, password: string) {
  const response = await fetch('/api/session', { method: 'POST', body: JSON.stringify({ email, password }) });
  const body = await response.json();
  if (response.status === 200) return { ok: true, user: body.user };
  return { ok: false, message: body.message };
}`;
    const result = analyzePractice(files);
    expect(result.state).toBe("observed");
    expect(result.score).toBe(100);
    expect(result.criteria.find((c) => c.id === "component-transport-isolation")?.points).toBe(30);
    expect(result.criteria.find((c) => c.id === "raw-response-containment")?.points).toBe(15);
  });

  test("document.body DOM access is not a raw response read", () => {
    const files = sourceMap();
    files["src/LoginPage.tsx"] = files["src/LoginPage.tsx"].replace(
      "try { await login('a', 'b'); } finally { setPhase('idle'); }",
      "document.body.classList.add('busy');\n    try { await login('a', 'b'); } finally { setPhase('idle'); document.body.classList.remove('busy'); }",
    );
    const result = analyzePractice(files);
    expect(result.state).toBe("observed");
    expect(result.score).toBe(100);
    expect(result.criteria.find((c) => c.id === "component-transport-isolation")?.points).toBe(30);
  });

  test("uncalled transport util import is not component transport", () => {
    const files = sourceMap();
    files["src/LoginPage.tsx"] = files["src/LoginPage.tsx"].replace("import { value } from './unrelated';", "import { track } from './analytics';");
    files["src/analytics.ts"] = `export async function track(event: string) { await fetch('/api/telemetry', { method: 'POST', body: JSON.stringify({ event }) }); }`;
    const result = analyzePractice(files);
    expect(result.state).toBe("observed");
    expect(result.score).toBe(100);
    expect(result.criteria.find((c) => c.id === "component-transport-isolation")?.points).toBe(30);
  });

  test("nested raw leak in a boundary return fails containment and translation", () => {
    const files = sourceMap();
    files["src/api/session.ts"] = `import { postSession } from './http';
export async function login(email: string, password: string) {
  const response = await postSession({ email, password });
  if (response.status === 200) return { ok: true, user: response.body.user, payload: response.body };
  return { ok: false, message: response.body.message };
}`;
    const result = analyzePractice(files);
    expect(result.state).toBe("observed");
    expect(result.criteria.find((c) => c.id === "raw-response-containment")?.points).toBe(0);
    expect(result.criteria.find((c) => c.id === "boundary-response-translation")?.points).toBe(0);
  });

  test("partial translation (failure returns raw response) fails translation and containment", () => {
    const files = sourceMap();
    files["src/api/session.ts"] = `import { postSession } from './http';
export async function login(email: string, password: string) {
  const response = await postSession({ email, password });
  if (response.status === 200) return { ok: true, user: response.body.user };
  return response;
}`;
    const result = analyzePractice(files);
    expect(result.state).toBe("observed");
    expect(result.criteria.find((c) => c.id === "boundary-response-translation")?.points).toBe(0);
    expect(result.criteria.find((c) => c.id === "raw-response-containment")?.points).toBe(0);
  });

  test("promise-chain delegation is equivalent to await", () => {
    const files = sourceMap();
    files["src/LoginPage.tsx"] = `import { login } from './api/session';
export function LoginPage() {
  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    login('a', 'b').then(() => {}).catch(() => {});
  }
  return <form onSubmit={handleSubmit}><button type="submit">??</button></form>;
}`;
    const result = analyzePractice(files);
    expect(result.state).toBe("observed");
    expect(result.score).toBe(100);
    expect(result.criteria.find((c) => c.id === "domain-operation-delegation")?.points).toBe(25);
  });

  test("bare external domain call without await fails closed as indeterminate", () => {
    const files = sourceMap();
    files["src/LoginPage.tsx"] = `import { login } from './api/session';
export function LoginPage() {
  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    login('a', 'b');
  }
  return <form onSubmit={handleSubmit}><button type="submit">??</button></form>;
}`;
    const result = analyzePractice(files);
    expect(result.state).toBe("indeterminate");
    expect(result.score).toBe(0);
    expect(result.reason).toContain("without await or promise chaining");
  });

  test("component selection is order independent and prefers the login page", () => {
    const files = sourceMap();
    files["src/components/Form.tsx"] = `import type { FormEvent } from 'react';
export function Form({ onSubmit }: { onSubmit: (event: FormEvent) => void }) {
  return <form onSubmit={onSubmit}><button type="submit">??</button></form>;
}`;
    files["src/LoginPage.tsx"] = `import { login } from './api/session';
import { Form } from './components/Form';
export function LoginPage() {
  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    await login('a', 'b');
  }
  return <Form onSubmit={handleSubmit} />;
}`;
    const forward = analyzePractice(files);
    const reversed: SourceMap = {};
    for (const key of ["src/components/Form.tsx", "src/LoginPage.tsx", "src/api/session.ts", "src/api/http.ts"]) reversed[key] = files[key];
    const backward = analyzePractice(reversed);
    expect(forward.state).toBe("observed");
    expect(forward.score).toBe(100);
    expect(backward.state).toBe("observed");
    expect(backward.score).toBe(forward.score);
    expect(backward.audit).toContain("src/LoginPage.tsx");
  });

  test("CSS module and side-effect imports are irrelevant, not unresolved", () => {
    const files = sourceMap();
    files["src/LoginPage.tsx"] = `import { login } from './api/session';
import styles from './LoginPage.module.css';
import './LoginPage.css';
export function LoginPage() {
  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    await login('a', 'b');
  }
  return <form onSubmit={handleSubmit} className={styles.form}><button type="submit">??</button></form>;
}`;
    files["src/LoginPage.module.css"] = ".form { display: grid; }";
    files["src/LoginPage.css"] = ".login-page { min-height: 100vh; }";
    const result = analyzePractice(files);
    expect(result.state).toBe("observed");
    expect(result.score).toBe(100);
  });

  test("component awaiting a raw transport adapter is not delegation", () => {
    const antiPattern = analyzePractice(sourceMap({ antiPattern: true }));
    expect(antiPattern.criteria.find((c) => c.id === "domain-operation-delegation")?.points).toBe(0);
    expect(antiPattern.criteria.find((c) => c.id === "component-transport-isolation")?.points).toBe(0);
  });

  test("ok-shaped adapter and if (response.ok) branching is equivalent to status 200/401", () => {
    const files = sourceMap();
    files["src/api/http.ts"] = `export async function postSession(input: unknown) {
  const response = await fetch('/api/session', { method: 'POST', body: JSON.stringify(input) });
  const body = await response.json();
  return { ok: response.status === 200, body };
}`;
    files["src/api/session.ts"] = `import { postSession } from './http';
export async function login(email: string, password: string) {
  const response = await postSession({ email, password });
  if (response.ok) return { ok: true, user: response.body.user };
  return { ok: false, message: response.body.message };
}`;
    const result = analyzePractice(files);
    expect(result.state).toBe("observed");
    expect(result.score).toBe(100);
    expect(result.criteria.find((c) => c.id === "boundary-response-translation")?.points).toBe(30);
  });

  test("LoginForm-named shared form forwarding onSubmit does not hijack the page", () => {
    const files = sourceMap();
    files["src/LoginForm.tsx"] = `import type { FormEvent } from 'react';
export function LoginForm({ onSubmit }: { onSubmit: (event: FormEvent) => void }) {
  return <form onSubmit={onSubmit}><button type="submit">登录</button></form>;
}`;
    files["src/LoginPage.tsx"] = `import { login } from './api/session';
import { LoginForm } from './LoginForm';
export function LoginPage() {
  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    await login('a', 'b');
  }
  return <LoginForm onSubmit={handleSubmit} />;
}`;
    const result = analyzePractice(files);
    expect(result.state).toBe("observed");
    expect(result.score).toBe(100);
    expect(result.audit).toContain("src/LoginPage.tsx");
  });

  test("translation is scoped to the submit-path operation, not the whole boundary module", () => {
    const files = sourceMap();
    files["src/api/session.ts"] = `import { postSession } from './http';
export type LoginResult = { ok: true; user: { id: string; display_name: string; role: string } } | { ok: false; message: string };
export async function login(email: string, password: string): Promise<LoginResult> {
  const response = await postSession({ email, password });
  return response as unknown as LoginResult;
}
export async function logout(): Promise<LoginResult> {
  const response = await postSession({ email: 'logout', password: '' });
  if (response.status === 200) return { ok: true, user: response.body.user };
  return { ok: false, message: '登出失败' };
}`;
    const result = analyzePractice(files);
    expect(result.state).toBe("observed");
    expect(result.criteria.find((c) => c.id === "boundary-response-translation")?.points).toBe(0);
    expect(result.criteria.find((c) => c.id === "raw-response-containment")?.points).toBe(0);
  });

  test("two candidate boundary modules fail closed with the ambiguity reason", () => {
    const files = sourceMap();
    files["src/api/session-admin.ts"] = `import { postSession } from './http';
export async function logout() {
  const response = await postSession({ email: 'logout', password: '' });
  if (response.status === 200) return { ok: true };
  return { ok: false, message: '登出失败' };
}`;
    files["src/LoginPage.tsx"] = `import { login } from './api/session';
import { logout } from './api/session-admin';
export function LoginPage() {
  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    await login('a', 'b');
  }
  async function handleLogout(event: SubmitEvent) {
    event.preventDefault();
    await logout();
  }
  return <div><form onSubmit={handleSubmit}><button type="submit">登录</button></form><form onSubmit={handleLogout}><button type="submit">登出</button></form></div>;
}`;
    const result = analyzePractice(files);
    expect(result.state).toBe("indeterminate");
    expect(result.reason).toContain("multiple candidate boundaries");
  });

  test("CSS imports with Vite query suffixes remain irrelevant", () => {
    const files = sourceMap();
    files["src/LoginPage.tsx"] = `import { login } from './api/session';
import styles from './LoginPage.module.css';
import stylesRaw from './LoginPage.module.css?inline';
export function LoginPage() {
  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    await login('a', 'b');
  }
  return <form onSubmit={handleSubmit} className={styles.form} data-css={stylesRaw}><button type="submit">登录</button></form>;
}`;
    files["src/LoginPage.module.css"] = ".form { display: grid; }";
    const result = analyzePractice(files);
    expect(result.state).toBe("observed");
    expect(result.score).toBe(100);
  });

  test("value and type imports from the same module resolve to one boundary", () => {
    const files = sourceMap();
    files["src/LoginPage.tsx"] = files["src/LoginPage.tsx"].replace(
      "import { login } from './api/session';",
      "import { login, type LoginResult } from './api/session';",
    );
    const result = analyzePractice(files);
    expect(result.state).toBe("observed");
    expect(result.score).toBe(100);
    expect(result.audit).not.toContain("src/LoginPage.tsx has multiple candidate boundaries");
  });

});
