import { expect, test } from "bun:test";
import { cp, mkdtemp, rm, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveInjectionCalibration, resolvePracticePayload, redactedInjectionTrace } from "../../../kernel/profiles/injection-calibration/v1/runtime";
import type { InjectionConditionId } from "../../../kernel/profiles/injection-calibration/v1/types";
import { expansionDecisions, materializeConventionDoc, materializeGitHistory, piArgs, classifyEvaluatorResult, evaluatorResult, isRecord, parseHistoricalSummary, replayHistoricalWorkspace, runAttempt, runJudgeProvider, summarizeJudge, verifyCandidateDeclaration, verifySnapshotIdentity, workspaceFiles, writeHistoricalReplaySummary, type RunnerPracticePayload } from "./profile-diagnostic-runner";
import { run } from "./preflight";
import { resolveRuntimeClosureIfDeclared } from "../../../evaluator/runtime-closure";

const fixturePath = join(import.meta.dir, "..", "..", "..", "kernel", "fixtures", "neutral");

async function withFixture(mutator?: (path: string) => Promise<void>): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "lorelum-profile-diagnostic-"));
  await cp(fixturePath, path, { recursive: true });
  const yaml = await Bun.file(join(path, "private/candidate.yaml")).text();
  const patched = yaml.replace("  public_root: public/starter\n", "  public_root: public/starter\n  source_commit: abc123\n");
  await Bun.write(join(path, "private/candidate.yaml"), patched);
  if (mutator) await mutator(path);
  return path;
}

const historicalHash = "a".repeat(64);
const historicalSnapshot = "b".repeat(64);
const evaluatorCommit = "c".repeat(40);

function legacyEntry(candidate: string, condition: "baseline" | "oracle-practice" | "irrelevant-practice", repeat = 1) {
  return {
    candidate,
    condition,
    repeat,
    trace: {
      condition_id: condition,
      channel: condition === "baseline" ? "none" : "condition-scoped-private-runtime",
      profile_input_hash: historicalHash,
      ...(condition === "baseline" ? {} : { practice_id: "practice-card", practice_version: "v1", practice_sha256: "d".repeat(64) }),
    },
    source_commit: "e".repeat(40),
    snapshot_id: historicalSnapshot,
    profile_input_hash: historicalHash,
  };
}

async function withReplayFixture(evaluator: string): Promise<{ candidate: string; historyRoot: string; entry: ReturnType<typeof parseHistoricalSummary>[number]; cleanup: () => Promise<void> }> {
  const candidate = await withFixture();
  const candidateId = "neutral-contract-fixture-v1";
  await mkdir(join(candidate, "private", "evaluator"), { recursive: true });
  await writeFile(join(candidate, "private", "evaluator", "evaluate.ts"), evaluator);
  const historyRoot = await mkdtemp(join(tmpdir(), "lorelum-history-"));
  const app = join(historyRoot, candidateId, candidateId, "baseline", "attempt-1", "workspace", "app");
  await mkdir(app, { recursive: true });
  await writeFile(join(app, "candidate.txt"), "unchanged");
  const entry = parseHistoricalSummary({ schema_version: "profile-diagnostic-summary/v1", entries: [legacyEntry(candidateId, "baseline")] }, candidateId)[0];
  return { candidate, historyRoot, entry, cleanup: async () => { await rm(candidate, { force: true, recursive: true }); await rm(historyRoot, { force: true, recursive: true }); } };
}

async function withAttemptFixture(): Promise<{ candidate: string; output: string; cleanup: () => Promise<void> }> {
  const candidate = await withFixture(async (path) => {
    const app = join(path, "public", "starter", "app");
    await mkdir(app, { recursive: true });
    await writeFile(join(app, "package.json"), '{"name":"public-starter","private":true}\n');
    await writeFile(join(app, "bun.lock"), "{}\n");
  });
  const output = await mkdtemp(join(tmpdir(), "lorelum-profile-attempt-"));
  return { candidate, output, cleanup: async () => { await rm(candidate, { force: true, recursive: true }); await rm(output, { force: true, recursive: true }); } };
}

test("baseline piArgs never includes --append-system-prompt", async () => {
  const profile = await resolveInjectionCalibration(fixturePath);
  const baseline = await resolvePracticePayload(fixturePath, profile, "baseline");
  const args = piArgs("test-model", baseline);
  expect(baseline.practice).toBeUndefined();
  expect(args).not.toContain("--append-system-prompt");
  expect(args).toContain("--model");
  expect(args).toContain("test-model");
});

test("oracle and irrelevant piArgs include --append-system-prompt with card text", async () => {
  const profile = await resolveInjectionCalibration(fixturePath);
  for (const conditionId of ["oracle-practice", "irrelevant-practice"] as InjectionConditionId[]) {
    const payload = await resolvePracticePayload(fixturePath, profile, conditionId);
    const args = piArgs("test-model", payload);
    const promptIndex = args.indexOf("--append-system-prompt");
    expect(promptIndex).toBeGreaterThan(-1);
    expect(args[promptIndex + 1]).toContain("Apply this Practice");
  }
});

test("redacted trace contains no Practice text or private paths", async () => {
  const profile = await resolveInjectionCalibration(fixturePath);
  const oracle = await resolvePracticePayload(fixturePath, profile, "oracle-practice");
  const trace = redactedInjectionTrace(profile, oracle);
  const serialized = JSON.stringify(trace);
  expect(serialized).not.toContain("Keep user interface state separate");
  expect(serialized).not.toContain("private/practices");
  expect(trace).toMatchObject({ condition_id: "oracle-practice", channel: "condition-scoped-private-runtime" });
  expect(trace.practice_id).toBeDefined();
  expect(trace.practice_sha256).toBeDefined();
});


test("verifyCandidateDeclaration accepts an injection-calibration/v2 candidate", async () => {
  const fixturePath = join(import.meta.dir, "..", "..", "..", "kernel", "fixtures", "neutral");
  const candidate = await mkdtemp(join(tmpdir(), "lorelum-runner-v2-"));
  try {
    await cp(fixturePath, candidate, { recursive: true });
    const manifestPath = join(candidate, "private", "candidate.yaml");
    const yaml = await Bun.file(manifestPath).text();
    const patched = yaml
      .replace("injection-calibration/v1", "injection-calibration/v2")
      .replace("  public_root: public/starter\n", "  public_root: public/starter\n  source_commit: abc123\n");
    await Bun.write(manifestPath, patched);
    const manifest = await verifyCandidateDeclaration(candidate);
    expect(manifest.kernel).toEqual({ core: "v1", profile: "injection-calibration/v2", materializer_kind: "react-vite" });
    expect(manifest.source.source_commit).toBe("abc123");
  } finally {
    await rm(candidate, { force: true, recursive: true });
  }
});

test("project-convention payloads never include --append-system-prompt", async () => {
  const convention: RunnerPracticePayload = {
    condition_id: "oracle-practice",
    channel: "condition-scoped-private-runtime",
    practice: { id: "x", version: "v1", sha256: "a".repeat(64), text: "frontend conventions", delivery_template: "project-convention/v1", target_path: "docs/frontend-guide.md" },
  };
  expect(piArgs("test-model", convention)).not.toContain("--append-system-prompt");
});



test("convention doc is committed into the per-condition git history (oracle), baseline has none", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "lorelum-convention-git-"));
  try {
    const app = join(workspace, "app");
    await mkdir(app, { recursive: true });
    await Bun.write(join(app, "index.html"), "<html></html>");
    await Bun.write(join(app, "src", "api", "http.ts"), "export const api = 1;");
    const oracle: RunnerPracticePayload = { condition_id: "oracle-practice", channel: "condition-scoped-private-runtime", practice: { id: "x", version: "v1", sha256: "a".repeat(64), text: "# 前端分层约定\n", delivery_template: "project-convention/v1", target_path: "docs/frontend-guide.md" } };
    await materializeConventionDoc(workspace, oracle);
    await materializeGitHistory(app, { identity: { name: "ops", email: "ops@x.io" }, commits: [{ message: "chore: scaffold", files: ["index.html"] }, { message: "feat: login shell", files: [] }] });
    const tracked = await run(["git", "-C", app, "ls-files"], app);
    expect(tracked.stdout).toContain("docs/frontend-guide.md");
    const status = await run(["git", "-C", app, "status", "--porcelain"], app);
    expect(status.stdout.trim()).toBe("");

    // baseline: no convention doc written -> no frontend-guide in history
    const baselineApp = join(workspace, "baseline-app");
    await mkdir(baselineApp, { recursive: true });
    await Bun.write(join(baselineApp, "index.html"), "<html></html>");
    await Bun.write(join(baselineApp, "src", "api", "http.ts"), "export const api = 1;");
    const baseline: RunnerPracticePayload = { condition_id: "baseline", channel: "none" };
    await materializeConventionDoc(workspace, baseline);
    await materializeGitHistory(baselineApp, { identity: { name: "ops", email: "ops@x.io" }, commits: [{ message: "chore: scaffold", files: ["index.html"] }, { message: "feat: login shell", files: [] }] });
    const baselineTracked = await run(["git", "-C", baselineApp, "ls-files"], baselineApp);
    expect(baselineTracked.stdout).not.toContain("frontend-guide.md");
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
});


test("runJudgeProvider writes a v2 sidecar for a declared provider and not-run otherwise", async () => {
  const attempt = await mkdtemp(join(tmpdir(), "lorelum-judge-attempt-"));
  const workspace = await mkdtemp(join(tmpdir(), "lorelum-judge-ws-"));
  try {
    const app = join(workspace, "app");
    await mkdir(join(app, "src", "api"), { recursive: true });
    await Bun.write(join(workspace, "task.md"), "接通登录页。\n");
    await Bun.write(join(app, "src", "LoginPage.tsx"), `import { login } from "./api/session";
export function LoginPage() {
  async function handleSubmit(e: SubmitEvent) { e.preventDefault(); await login("a", "b"); }
  return <form onSubmit={handleSubmit}><button type="submit">登录</button></form>;
}
`);
    await Bun.write(join(app, "src", "api", "session.ts"), `import { postSession } from "./http";
export async function login(email: string, password: string) {
  const response = await postSession({ email, password });
  if (response.status === 200) return { ok: true, user: response.body.user };
  return { ok: false, message: response.body.message };
}
`);
    await Bun.write(join(app, "src", "api", "http.ts"), `export async function postSession(input: unknown) {
  const response = await fetch("/api/session", { method: "POST", body: JSON.stringify(input) });
  const body = await response.json();
  return response.status === 200 ? { status: 200, body } : { status: 401, body };
}
`);
    const shared = { pi_version: "0.80.10", model: { id: "m" }, budget: { max_duration_minutes: 1 }, repetitions: 1, judge: { provider: "practice-layered-api/v2" } };
    const entry = await runJudgeProvider(attempt, workspace, shared);
    expect(entry.state).toBe("observed");
    expect(entry.score).toBe(100);
    expect(entry.provider_id).toBe("practice-layered-api/v2");
    expect(entry.rubric_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(await Bun.file(join(attempt, "judge.sidecar.json")).exists()).toBe(true);

    const noProvider = await runJudgeProvider(attempt, workspace, { pi_version: "0.80.10", model: { id: "m" }, budget: { max_duration_minutes: 1 }, repetitions: 1 });
    expect(noProvider.state).toBe("not-run");
    const unknown = await runJudgeProvider(attempt, workspace, { pi_version: "0.80.10", model: { id: "m" }, budget: { max_duration_minutes: 1 }, repetitions: 1, judge: { provider: "nope" } });
    expect(unknown.state).toBe("judge-unavailable");
  } finally {
    await rm(attempt, { force: true, recursive: true });
    await rm(workspace, { force: true, recursive: true });
  }
});

test("summarizeJudge aggregates redacted per-condition counts", () => {
  const base = { candidate: "c", condition: "baseline", repeat: 1, evaluation_status: "evaluated" as const, trace: { condition_id: "baseline" as const, channel: "none" as const, profile_input_hash: "h" }, source_commit: "s", snapshot_id: "s", profile_input_hash: "h" };
  const entries = [
    { ...base, judge: { provider_id: "practice-layered-api", provider_version: "2.0.0", state: "observed" as const, score: 100, rubric_hash: "r".repeat(64) } },
    { ...base, condition: "oracle-practice", trace: { condition_id: "oracle-practice" as const, channel: "x" as const, profile_input_hash: "h" }, judge: { provider_id: "practice-layered-api", provider_version: "2.0.0", state: "indeterminate" as const, reason: "unresolved" } },
  ];
  const summary = summarizeJudge(entries);
  expect(summary.rubric_hash).toBe("r".repeat(64));
  expect(summary.by_condition.baseline).toMatchObject({ observed: 1, indeterminate: 0 });
  expect(summary.by_condition.baseline.scores).toEqual([100]);
  expect(summary.by_condition["oracle-practice"]).toMatchObject({ observed: 0, indeterminate: 1 });
});

test("materializeGitHistory builds a realistic commit history with a clean tree", async () => {
  const app = await mkdtemp(join(tmpdir(), "lorelum-githistory-"));
  try {
    await Bun.write(join(app, "index.html"), "<html></html>");
    await Bun.write(join(app, "src", "api", "http.ts"), "export const api = 1;");
    await Bun.write(join(app, "src", "LoginPage.tsx"), "export function LoginPage() { return null; }");
    const history = {
      identity: { name: "ops-admin", email: "ops@meridian.internal" },
      commits: [
        { message: "chore: scaffold", files: ["index.html"] },
        { message: "feat(api): client", files: ["src/api/http.ts"] },
        { message: "feat: login shell", files: [] },
      ],
    };
    await materializeGitHistory(app, history);
    const log = await run(["git", "-C", app, "log", "--format=%s"], app);
    expect(log.code).toBe(0);
    expect(log.stdout.trim().split("\n")).toEqual(["feat: login shell", "feat(api): client", "chore: scaffold"]);
    const status = await run(["git", "-C", app, "status", "--porcelain"], app);
    expect(status.stdout.trim()).toBe("");
  } finally {
    await rm(app, { force: true, recursive: true });
  }
});

test("materializeConventionDoc writes the convention into the app workspace and guards escapes", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "lorelum-convention-ws-"));
  try {
    await Bun.write(join(workspace, "task.md"), "task");
    await mkdir(join(workspace, "app"), { recursive: true });
    const payload: RunnerPracticePayload = {
      condition_id: "oracle-practice",
      channel: "condition-scoped-private-runtime",
      practice: { id: "x", version: "v1", sha256: "a".repeat(64), text: "# 前端约定\n", delivery_template: "project-convention/v1", target_path: "docs/frontend-guide.md" },
    };
    await materializeConventionDoc(workspace, payload);
    const written = await Bun.file(join(workspace, "app", "docs", "frontend-guide.md")).text();
    expect(written).toContain("前端约定");
    const baseline: RunnerPracticePayload = { condition_id: "baseline", channel: "none" };
    await materializeConventionDoc(workspace, baseline);
    expect(await Bun.file(join(workspace, "app", "docs", "frontend-guide.md")).exists()).toBe(true);
    const escaping: RunnerPracticePayload = { ...payload, practice: { ...payload.practice!, target_path: "../escape.md" } };
    await expect(materializeConventionDoc(workspace, escaping)).rejects.toThrow("escapes the app workspace");
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
});

test("verifyCandidateDeclaration accepts a valid profile v1 candidate", async () => {
  const path = await withFixture();
  try {
    const manifest = await verifyCandidateDeclaration(path);
    expect(manifest.kernel).toEqual({ core: "v1", profile: "injection-calibration/v1", materializer_kind: "react-vite" });
    expect(manifest.source.source_commit).toBe("abc123");
  } finally {
    await rm(path, { force: true, recursive: true });
  }
});

test("verifyCandidateDeclaration rejects a non-injection-calibration candidate", async () => {
  const path = await withFixture(async (candidate) => {
    const yaml = await Bun.file(join(candidate, "private/candidate.yaml")).text();
    await Bun.write(join(candidate, "private/candidate.yaml"), yaml.replace("injection-calibration/v1", "treatment-comparison/v1"));
  });
  try {
    await expect(verifyCandidateDeclaration(path)).rejects.toThrow("does not declare core/v1 + injection-calibration/v1|v2 + react-vite");
  } finally {
    await rm(path, { force: true, recursive: true });
  }
});

test("verifySnapshotIdentity rejects a profile_input_hash mismatch", async () => {
  const path = await withFixture(async (candidate) => {
    await Bun.write(
      join(candidate, "private/snapshot.json"),
      JSON.stringify({ snapshot_id: "abc", resolved: { profile_input_hash: "deadbeef".repeat(8) } })
    );
  });
  try {
    const manifest = await verifyCandidateDeclaration(path);
    await expect(verifySnapshotIdentity(path, manifest)).rejects.toThrow("profile_input_hash mismatch");
  } finally {
    await rm(path, { force: true, recursive: true });
  }
});

test("verifySnapshotIdentity rejects a missing profile_input_hash", async () => {
  const path = await withFixture(async (candidate) => {
    await Bun.write(join(candidate, "private/snapshot.json"), JSON.stringify({ snapshot_id: "abc" }));
  });
  try {
    const manifest = await verifyCandidateDeclaration(path);
    await expect(verifySnapshotIdentity(path, manifest)).rejects.toThrow("resolved.profile_input_hash");
  } finally {
    await rm(path, { force: true, recursive: true });
  }
});

test("evaluatorResult parses independent semantic and Practice observation results", () => {
  const result = evaluatorResult('{"semantic":"pass","practice_observation":"not-observed"}');
  expect(result).toEqual({ semantic: "pass", practice_observation: "not-observed" });
});

test("evaluatorResult preserves an indeterminate observation reason", () => {
  const result = evaluatorResult('{"semantic":"pass","practice_observation":"indeterminate","observation_reason":"unresolved-import"}');
  expect(result).toEqual({ semantic: "pass", practice_observation: "indeterminate", observation_reason: "unresolved-import" });
});

test("evaluatorResult accepts a valid semantic failure without an evaluator failure", () => {
  const result = evaluatorResult('{"semantic":"fail","practice_observation":"not-run"}');
  expect(result).toEqual({ semantic: "fail", practice_observation: "not-run" });
});

test("evaluatorResult rejects incomplete or unsupported observation output", () => {
  expect(evaluatorResult('{"semantic":"pass","practice_probe":"fail"}')).toBeUndefined();
  expect(evaluatorResult('{"semantic":"pass","practice_observation":"unknown"}')).toBeUndefined();
});

test("evaluatorResult returns undefined when no structured result is present", () => {
  expect(evaluatorResult("no JSON here")).toBeUndefined();
});

test("nonzero evaluator exit discards a structured partial result", () => {
  const result = classifyEvaluatorResult({
    code: 1,
    stdout: '{"semantic":"pass","practice_observation":"observed"}',
    stderr: "private/evaluator assertion failed",
    timedOut: false,
    durationMs: 1,
  });
  expect(result).toEqual({ evaluation_status: "execution-failed", error: "evaluator-exit-nonzero" });
  expect(result).not.toHaveProperty("semantic");
  expect(result).not.toHaveProperty("practice_observation");
  expect(result).not.toHaveProperty("joint_pass");
});

test("timed out evaluator discards output without leaking stderr", () => {
  const result = classifyEvaluatorResult({
    code: null,
    stdout: '{"semantic":"pass","practice_observation":"observed"}',
    stderr: "E:\\private\\evaluator\\oracle.yaml",
    timedOut: true,
    durationMs: 1,
  });
  expect(result).toEqual({ evaluation_status: "execution-failed", error: "evaluator-timed-out" });
  expect(JSON.stringify(result)).not.toContain("private");
});

test("zero-exit evaluator requires a complete structured result", () => {
  const result = classifyEvaluatorResult({ code: 0, stdout: "no JSON", stderr: "", timedOut: false, durationMs: 1 });
  expect(result).toEqual({ evaluation_status: "invalid-output", error: "evaluator-invalid-output" });
});

test("zero-exit semantic failure remains a healthy evaluator result", () => {
  const result = classifyEvaluatorResult({
    code: 0,
    stdout: '{"semantic":"fail","practice_observation":"not-run"}',
    stderr: "",
    timedOut: false,
    durationMs: 1,
  });
  expect(result).toEqual({
    evaluation_status: "evaluated",
    semantic: "fail",
    practice_observation: "not-run",
    joint_pass: false,
  });
});

test("provisions the public app after Pi and before private evaluation", async () => {
  const fixture = await withAttemptFixture();
  const phases: string[] = [];
  let serverStopped = false;
  try {
    const profile = await resolveInjectionCalibration(fixture.candidate);
    const entry = await runAttempt(
      fixture.output,
      fixture.candidate,
      "neutral-contract-fixture-v1",
      { id: "neutral-contract-fixture-v1", kernel: { core: "v1", profile: "injection-calibration/v1", materializer_kind: "react-vite" }, source: { source_commit: "abc123" } },
      "snapshot",
      profile.profile_input_hash,
      profile,
      "baseline",
      1,
      { pi_version: "test", model: { id: "test-model" }, budget: { max_duration_minutes: 1 }, repetitions: 1 },
      "fake-pi",
      async (command, cwd) => {
        if (command[0] === "fake-pi") {
          phases.push("pi");
          const files = await workspaceFiles(cwd);
          expect(files).toContain("app/package.json");
          expect(files).not.toContain("app/node_modules/.cache");
          expect(files.some((file) => file.includes("private/") || file.includes("practices/"))).toBe(false);
          return { code: 0, stdout: "", stderr: "", timedOut: false, durationMs: 1 };
        }
        if (command[1] === "install") {
          phases.push("provision");
          expect(cwd.replaceAll("\\", "/")).toEndWith("provisioning-inputs");
          expect(command).toEqual([process.execPath, "install", "--frozen-lockfile", "--ignore-scripts"]);
          expect((await workspaceFiles(cwd)).some((file) => file.includes("private/") || file.includes("practices/"))).toBe(false);
          await mkdir(join(cwd, "node_modules"), { recursive: true });
          return { code: 0, stdout: "", stderr: "", timedOut: false, durationMs: 1 };
        }
        phases.push("evaluator");
        expect(command[1]).toBe("run");
        return { code: 0, stdout: '{"semantic":"pass","practice_observation":"observed"}', stderr: "", timedOut: false, durationMs: 1 };
      },
      async (_cwd, port) => {
        phases.push("server");
        return { ok: true, handle: { pid: 42, port, stop: async () => { serverStopped = true; return true; } } };
      }
    );
    expect(entry.error).toBeUndefined();
    expect(phases).toEqual(["pi", "provision", "server", "evaluator"]);
    expect(serverStopped).toBe(true);
    expect(entry).toMatchObject({ evaluation_status: "evaluated", semantic: "pass", practice_observation: "observed", joint_pass: true });
  } finally {
    await fixture.cleanup();
  }
});

test("server launch failure records execution-failed without semantic fields", async () => {
  const fixture = await withAttemptFixture();
  try {
    const profile = await resolveInjectionCalibration(fixture.candidate);
    const entry = await runAttempt(
      fixture.output,
      fixture.candidate,
      "neutral-contract-fixture-v1",
      { id: "neutral-contract-fixture-v1", kernel: { core: "v1", profile: "injection-calibration/v1", materializer_kind: "react-vite" }, source: { source_commit: "abc123" } },
      "snapshot",
      profile.profile_input_hash,
      profile,
      "baseline",
      1,
      { pi_version: "test", model: { id: "test-model" }, budget: { max_duration_minutes: 1 }, repetitions: 1 },
      "fake-pi",
      async (command, cwd) => {
        if (command[0] === "fake-pi") return { code: 0, stdout: "", stderr: "", timedOut: false, durationMs: 1 };
        if (command[1] === "install") { await mkdir(join(cwd, "node_modules"), { recursive: true }); return { code: 0, stdout: "", stderr: "", timedOut: false, durationMs: 1 }; }
        throw new Error("evaluator must not run after server launch failure");
      },
      async () => ({ ok: false as const, category: "evaluator-server-launch-failed" })
    );
    expect(entry).toEqual(expect.objectContaining({ evaluation_status: "execution-failed", error: "evaluator-server-launch-failed" }));
    expect(entry.semantic).toBeUndefined();
    expect(entry.practice_observation).toBeUndefined();
    expect(entry.joint_pass).toBeUndefined();
  } finally {
    await fixture.cleanup();
  }
});

test("unconfirmed server cleanup blocks comparison with execution-failed", async () => {
  const fixture = await withAttemptFixture();
  try {
    const profile = await resolveInjectionCalibration(fixture.candidate);
    const entry = await runAttempt(
      fixture.output,
      fixture.candidate,
      "neutral-contract-fixture-v1",
      { id: "neutral-contract-fixture-v1", kernel: { core: "v1", profile: "injection-calibration/v1", materializer_kind: "react-vite" }, source: { source_commit: "abc123" } },
      "snapshot",
      profile.profile_input_hash,
      profile,
      "baseline",
      1,
      { pi_version: "test", model: { id: "test-model" }, budget: { max_duration_minutes: 1 }, repetitions: 1 },
      "fake-pi",
      async (command, cwd) => {
        if (command[0] === "fake-pi") return { code: 0, stdout: "", stderr: "", timedOut: false, durationMs: 1 };
        if (command[1] === "install") { await mkdir(join(cwd, "node_modules"), { recursive: true }); return { code: 0, stdout: "", stderr: "", timedOut: false, durationMs: 1 }; }
        return { code: 0, stdout: '{"semantic":"pass","practice_observation":"observed"}', stderr: "", timedOut: false, durationMs: 1 };
      },
      async (_cwd, port) => ({ ok: true, handle: { pid: 42, port, stop: async () => false } })
    );
    expect(entry).toEqual(expect.objectContaining({ evaluation_status: "execution-failed", error: "evaluator-cleanup-unverified" }));
    expect(entry.semantic).toBeUndefined();
    expect(entry.practice_observation).toBeUndefined();
    expect(entry.joint_pass).toBeUndefined();
  } finally {
    await fixture.cleanup();
  }
});
test("failed public dependency provisioning skips evaluator with a redacted execution failure", async () => {
  const fixture = await withAttemptFixture();
  const phases: string[] = [];
  try {
    const profile = await resolveInjectionCalibration(fixture.candidate);
    const entry = await runAttempt(
      fixture.output,
      fixture.candidate,
      "neutral-contract-fixture-v1",
      { id: "neutral-contract-fixture-v1", kernel: { core: "v1", profile: "injection-calibration/v1", materializer_kind: "react-vite" }, source: { source_commit: "abc123" } },
      "snapshot",
      profile.profile_input_hash,
      profile,
      "baseline",
      1,
      { pi_version: "test", model: { id: "test-model" }, budget: { max_duration_minutes: 1 }, repetitions: 1 },
      "fake-pi",
      async (command) => {
        if (command[0] === "fake-pi") {
          phases.push("pi");
          return { code: 0, stdout: "", stderr: "", timedOut: false, durationMs: 1 };
        }
        if (command[1] === "install") {
          phases.push("provision");
          return { code: 1, stdout: "", stderr: "E:\\private\\dependency-source", timedOut: false, durationMs: 1 };
        }
        phases.push("evaluator");
        throw new Error("evaluator must not run after provisioning failure");
      }
    );
    expect(phases).toEqual(["pi", "provision"]);
    expect(entry).toEqual(expect.objectContaining({ evaluation_status: "execution-failed", error: "public-dependency-provisioning-failed" }));
    expect(entry.semantic).toBeUndefined();
    expect(entry.practice_observation).toBeUndefined();
    expect(entry.joint_pass).toBeUndefined();
    expect(JSON.stringify(entry)).not.toContain("private");
  } finally {
    await fixture.cleanup();
  }
});

test("Pi-modified dependency inputs fail closed before lifecycle scripts or evaluator execution", async () => {
  const fixture = await withAttemptFixture();
  const phases: string[] = [];
  try {
    const profile = await resolveInjectionCalibration(fixture.candidate);
    const entry = await runAttempt(
      fixture.output,
      fixture.candidate,
      "neutral-contract-fixture-v1",
      { id: "neutral-contract-fixture-v1", kernel: { core: "v1", profile: "injection-calibration/v1", materializer_kind: "react-vite" }, source: { source_commit: "abc123" } },
      "snapshot",
      profile.profile_input_hash,
      profile,
      "baseline",
      1,
      { pi_version: "test", model: { id: "test-model" }, budget: { max_duration_minutes: 1 }, repetitions: 1 },
      "fake-pi",
      async (command, cwd) => {
        if (command[0] === "fake-pi") {
          phases.push("pi");
          await writeFile(join(cwd, "app", "package.json"), '{"scripts":{"postinstall":"exit 1"}}\n');
          await writeFile(join(cwd, "app", "bun.lock"), "modified\n");
          return { code: 0, stdout: "", stderr: "", timedOut: false, durationMs: 1 };
        }
        phases.push(command[1] === "install" ? "provision" : "evaluator");
        throw new Error("modified dependency inputs must not run host commands");
      }
    );
    expect(phases).toEqual(["pi"]);
    expect(entry).toEqual(expect.objectContaining({ evaluation_status: "execution-failed", error: "public-dependency-inputs-modified" }));
    expect(entry.semantic).toBeUndefined();
    expect(entry.practice_observation).toBeUndefined();
    expect(JSON.stringify(entry)).not.toContain("postinstall");
  } finally {
    await fixture.cleanup();
  }
});

test("isRecord distinguishes objects from arrays and primitives", () => {
  expect(isRecord({})).toBe(true);
  expect(isRecord([])).toBe(false);
  expect(isRecord(null)).toBe(false);
  expect(isRecord("string")).toBe(false);
});

test("parses only redacted v1 history entries", () => {
  const candidate = "candidate-v1";
  const parsed = parseHistoricalSummary({ schema_version: "profile-diagnostic-summary/v1", entries: [legacyEntry(candidate, "oracle-practice")] }, candidate);
  expect(parsed).toHaveLength(1);
  expect(parsed[0]).toMatchObject({ candidate, condition: "oracle-practice", source_commit: "e".repeat(40), profile_input_hash: historicalHash });
  expect(() => parseHistoricalSummary({ schema_version: "profile-diagnostic-summary/v1", entries: [{ ...legacyEntry(candidate, "baseline"), trace: { path: "private/secret" } }] }, candidate)).toThrow("invalid-history-summary");
});

test("replays an existing workspace with a current evaluator despite historical identity differences", async () => {
  const fixture = await withReplayFixture('console.log(JSON.stringify({ semantic: "pass", practice_observation: "observed" }));');
  try {
    const replay = await replayHistoricalWorkspace(fixture.historyRoot, fixture.candidate, fixture.entry, evaluatorCommit, 10_000);
    expect(replay).toMatchObject({ evaluation_status: "evaluated", semantic: "pass", practice_observation: "observed", joint_pass: true, evaluator_source_commit: evaluatorCommit, snapshot_id: historicalSnapshot, profile_input_hash: historicalHash });
  } finally {
    await fixture.cleanup();
  }
});

test("marks a missing workspace not executable without an evaluator invocation", async () => {
  const fixture = await withReplayFixture('throw new Error("evaluator should not execute");');
  try {
    await rm(join(fixture.historyRoot, "neutral-contract-fixture-v1", "neutral-contract-fixture-v1", "baseline", "attempt-1"), { force: true, recursive: true });
    const replay = await replayHistoricalWorkspace(fixture.historyRoot, fixture.candidate, fixture.entry, evaluatorCommit, 10_000);
    expect(replay).toMatchObject({ evaluation_status: "not-executable", replay_reason: "missing-workspace" });
  } finally {
    await fixture.cleanup();
  }
});

test("records malformed output, nonzero evaluator exits, and workspace mutations as unhealthy", async () => {
  const malformed = await withReplayFixture('console.log("not a structured result");');
  try {
    expect(await replayHistoricalWorkspace(malformed.historyRoot, malformed.candidate, malformed.entry, evaluatorCommit, 10_000)).toMatchObject({ evaluation_status: "invalid-output", replay_reason: "invalid-evaluator-output" });
  } finally {
    await malformed.cleanup();
  }
  const nonzero = await withReplayFixture('console.log(JSON.stringify({ semantic: "pass", practice_observation: "observed" })); process.exit(1);');
  try {
    expect(await replayHistoricalWorkspace(nonzero.historyRoot, nonzero.candidate, nonzero.entry, evaluatorCommit, 10_000)).toMatchObject({ evaluation_status: "execution-failed", replay_reason: "evaluator-execution-failed" });
  } finally {
    await nonzero.cleanup();
  }
  const mutating = await withReplayFixture('await Bun.write(`${process.argv[2]}/changed.txt`, "changed"); console.log(JSON.stringify({ semantic: "pass", practice_observation: "observed" }));');
  try {
    expect(await replayHistoricalWorkspace(mutating.historyRoot, mutating.candidate, mutating.entry, evaluatorCommit, 10_000)).toMatchObject({ evaluation_status: "execution-failed", replay_reason: "workspace-modified-during-replay" });
  } finally {
    await mutating.cleanup();
  }
  const siblingMutation = await withReplayFixture('await Bun.write(`${process.argv[2]}/../task.md`, "changed"); console.log(JSON.stringify({ semantic: "pass", practice_observation: "observed" }));');
  try {
    expect(await replayHistoricalWorkspace(siblingMutation.historyRoot, siblingMutation.candidate, siblingMutation.entry, evaluatorCommit, 10_000)).toMatchObject({ evaluation_status: "execution-failed", replay_reason: "workspace-modified-during-replay" });
  } finally {
    await siblingMutation.cleanup();
  }
});

test("makes candidate-level expansion decisions and writes a redacted replay summary", async () => {
  const candidate = "candidate-v1";
  const entries = ([
    ["baseline", false], ["irrelevant-practice", false], ["oracle-practice", true],
  ] as const).map(([condition, jointPass]) => ({ ...legacyEntry(candidate, condition), evaluator_source_commit: evaluatorCommit, evaluation_status: "evaluated" as const, semantic: "pass", practice_observation: jointPass ? "observed" as const : "not-observed" as const, joint_pass: jointPass }));
  const passingAudits = { [candidate]: { calibration: "passed" as const, leakage: "passed" as const } };
  expect(expansionDecisions(entries)[0]).toMatchObject({ status: "indeterminate", calibration_status: "not-verified", leakage_audit_status: "not-verified" });
  expect(expansionDecisions(entries, passingAudits)[0].status).toBe("eligible-for-expansion");
  expect(expansionDecisions([{ ...entries[0], evaluation_status: "not-executable" }], passingAudits)[0].status).toBe("indeterminate");
  expect(expansionDecisions(entries.map((entry) => ({ ...entry, joint_pass: false, practice_observation: "not-observed" as const })), passingAudits)[0].status).toBe("adjust-before-expansion");
  const splitHash = "f".repeat(64);
  const splitInput = ([1, 2] as const).flatMap((repeat) => ([
    ["baseline", false], ["irrelevant-practice", false], ["oracle-practice", true],
  ] as const).map(([condition, jointPass]) => ({
    ...legacyEntry(candidate, condition, repeat),
    profile_input_hash: repeat === 1 ? historicalHash : splitHash,
    trace: { ...legacyEntry(candidate, condition, repeat).trace, profile_input_hash: repeat === 1 ? historicalHash : splitHash },
    evaluator_source_commit: evaluatorCommit,
    evaluation_status: "evaluated" as const,
    semantic: "pass",
    practice_observation: jointPass ? "observed" as const : "not-observed" as const,
    joint_pass: jointPass,
  })));
  expect(expansionDecisions(splitInput, passingAudits).map((decision) => decision.status)).toEqual(["indeterminate", "indeterminate"]);
  const output = await mkdtemp(join(tmpdir(), "lorelum-replay-summary-"));
  try {
    await writeHistoricalReplaySummary(output, entries, evaluatorCommit, passingAudits);
    const summary = await readFile(join(output, "summary.json"), "utf8");
    expect(summary).toContain("historical-evaluator-replay");
    expect(summary).toContain("eligible-for-expansion");
    expect(summary).not.toContain("private/");
    expect(summary).not.toContain(output);
  } finally {
    await rm(output, { force: true, recursive: true });
  }
});

test("runtime closure failure records execution-failed without semantic fields", async () => {
  const candidate = await withFixture();
  const candidateId = "neutral-contract-fixture-v1";
  const historyRoot = await mkdtemp(join(tmpdir(), "lorelum-closure-fail-"));
  try {
    await mkdir(join(candidate, "private", "evaluator"), { recursive: true });
    await writeFile(join(candidate, "private", "evaluator", "runtime-closure.yaml"), Bun.YAML.stringify({
      version: "v1",
      package_manager: "bun",
      dependencies: { typescript: "5.9.3" },
      lock_input: { package_json_sha256: "0".repeat(64), bun_lock_sha256: "0".repeat(64) },
      integrity: { algorithm: "sha256", typescript_sha256: "0".repeat(64) },
    }));
    const app = join(historyRoot, candidateId, candidateId, "baseline", "attempt-1", "workspace", "app");
    await mkdir(app, { recursive: true });
    await writeFile(join(app, "candidate.txt"), "unchanged");
    const entry = parseHistoricalSummary({ schema_version: "profile-diagnostic-summary/v1", entries: [legacyEntry(candidateId, "baseline")] }, candidateId)[0];
    const replay = await replayHistoricalWorkspace(historyRoot, candidate, entry, evaluatorCommit, 10_000);
    expect(replay.evaluation_status).toBe("execution-failed");
    expect(replay.replay_reason).toBe("evaluator-runtime-closure-unverified");
    expect(replay.semantic).toBeUndefined();
    expect(replay.practice_observation).toBeUndefined();
  } finally {
    await rm(candidate, { force: true, recursive: true });
    await rm(historyRoot, { force: true, recursive: true });
  }
});

test("resolveRuntimeClosureIfDeclared returns null for a candidate without a closure", async () => {
  const path = await withFixture();
  try {
    expect(await resolveRuntimeClosureIfDeclared(path, "neutral-contract-fixture-v1")).toBeNull();
  } finally {
    await rm(path, { force: true, recursive: true });
  }
});
