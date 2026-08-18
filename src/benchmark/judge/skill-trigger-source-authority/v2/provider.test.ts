import { expect, test } from "bun:test";
import { buildJudgeInput } from "../../input";
import { resolveJudgeProvider } from "../../providers";
import { assertJudgeResultV1 } from "../../../outcome/v1/contract";
import { assertGeneratedRubric } from "../../judge-agent/generic/v1/rubric";
import { scoreCandidate } from "../../judge-agent/generic/v1/score";
import { loadRubric, assertRubric, rubricHash, serializeRubricText } from "./rubric";
import { createSourceAuthorityProvider, sourceAuthoritySystemPrompt } from "./provider";

const taskMd = "项目概览结果错位：政策 PX-47 定义操作来源的结果权威，不能只按操作开始时间推断。\n";

const referenceDashboard = `import { useEffect, useRef, useState } from "react";
import { fetchProjects } from "./services/projects";
export function Dashboard() {
  const [scope, setScope] = useState("active");
  const [state, setState] = useState({ kind: "loading", scope: "active" });
  const foregroundSeq = useRef(0);
  const loadProjects = (nextScope: string, source: string) => {
    const isForeground = source !== "reconciliation";
    const seq = isForeground ? ++foregroundSeq.current : foregroundSeq.current;
    if (isForeground) setState({ kind: "loading", scope: nextScope });
    fetchProjects(nextScope, source)
      .then((response) => {
        if (!isForeground || seq !== foregroundSeq.current) return;
        setState(response.status === 200 ? { kind: "ready", scope: nextScope, projects: response.body.projects } : { kind: "error", scope: nextScope, message: "unavailable" });
      })
      .catch(() => {
        if (!isForeground || seq !== foregroundSeq.current) return;
        setState({ kind: "error", scope: nextScope, message: "unavailable" });
      });
  };
  useEffect(() => { loadProjects(scope, "navigation"); }, [scope]);
  return <main><section><h1>项目概览</h1><nav aria-label="项目范围"><button type="button" onClick={() => setScope("active")}>进行中项目</button><button type="button" onClick={() => setScope("archived")}>已归档项目</button></nav><button type="button" onClick={() => loadProjects(scope, "manual-reload")}>重新加载当前范围</button><button type="button" onClick={() => loadProjects(scope, "reconciliation")}>运行后台协调</button>{state.kind === "loading" && <p role="status">加载中…</p>}{state.kind === "error" && <p role="alert">{state.message}</p>}{state.kind === "ready" && <ul aria-label="进行中项目">{state.projects.map((project) => <li key={project.id}>{project.name}</li>)}</ul>}</section></main>;
}`;

const latestWinsDashboard = `import { useEffect, useRef, useState } from "react";
import { fetchProjects } from "./services/projects";
export function Dashboard() {
  const [scope, setScope] = useState("active");
  const [state, setState] = useState({ kind: "loading", scope: "active" });
  const latest = useRef(0);
  const loadProjects = (nextScope: string, source: string) => {
    const seq = ++latest.current;
    setState({ kind: "loading", scope: nextScope });
    fetchProjects(nextScope, source)
      .then((response) => {
        if (seq !== latest.current) return;
        setState(response.status === 200 ? { kind: "ready", scope: nextScope, projects: response.body.projects } : { kind: "error", scope: nextScope, message: "unavailable" });
      })
      .catch(() => {
        if (seq !== latest.current) return;
        setState({ kind: "error", scope: nextScope, message: "unavailable" });
      });
  };
  useEffect(() => { loadProjects(scope, "navigation"); }, [scope]);
  return <main><section><h1>项目概览</h1><nav aria-label="项目范围"><button type="button" onClick={() => setScope("active")}>进行中项目</button></nav><button type="button" onClick={() => loadProjects(scope, "manual-reload")}>重新加载当前范围</button><button type="button" onClick={() => loadProjects(scope, "reconciliation")}>运行后台协调</button>{state.kind === "loading" && <p role="status">加载中…</p>}{state.kind === "error" && <p role="alert">{state.message}</p>}</section></main>;
}`;

function diff(files: Record<string, string>): string {
  return Object.entries(files).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)).map(([path, content]) => `${path}\u0000${content.length}\u0000${content}`).join("\n");
}

function stubCompletion(results: unknown[]): (system: string, user: string) => Promise<unknown> {
  let index = 0;
  return async () => {
    const value = results[index] ?? results[results.length - 1];
    index += 1;
    return value;
  };
}

test("source-authority rubric declares the four PX-47 dimensions totaling 100", async () => {
  const { doc } = await loadRubric();
  expect(doc.version).toBe("v2");
  expect(doc.dimensions.map((dimension) => dimension.id)).toEqual([
    "foreground-authority",
    "background-window-authority",
    "superseded-foreground",
    "state-feedback-preserved",
  ]);
  expect(doc.dimensions.reduce((sum, dimension) => sum + dimension.max_points, 0)).toBe(100);
  expect(doc.thresholds.reference_min).toBeGreaterThan(doc.thresholds.anti_pattern_max);
  expect(() => assertRubric({ ...doc, version: "v3" })).toThrow();
});

test("provider rubricText is a stable static private rubric", async () => {
  const provider = createSourceAuthorityProvider({});
  const text = await provider.rubricText();
  expect(text).toContain("foreground-authority");
  expect(text).toContain("background-window-authority");
  expect(await rubricHash()).toMatch(/^[a-f0-9]{64}$/);
  expect(serializeRubricText((await loadRubric()).doc)).toBe(text);
});

test("scoreCandidate with the source-authority prompt assembles an observed judge result", async () => {
  const { text: rubricText, doc } = await loadRubric();
  const rubric = assertGeneratedRubric({
    dimensions: doc.dimensions.map((dimension) => ({ id: dimension.id, name: dimension.id, description: dimension.description, max_points: dimension.max_points })),
  });
  const input = await buildJudgeInput({ task_md: taskMd, candidate_diff: diff({ "src/Dashboard.tsx": referenceDashboard }), rubric: rubricText });
  const complete = stubCompletion([{ criteria: [
    { id: "foreground-authority", points: 30, rationale: "foreground writes state only when it is the latest foreground operation" },
    { id: "background-window-authority", points: 30, rationale: "reconciliation returns without writing state" },
    { id: "superseded-foreground", points: 25, rationale: "superseded foreground rejects are ignored" },
    { id: "state-feedback-preserved", points: 15, rationale: "loading and error states preserved" },
  ], confidence: 92 }]);
  const result = await scoreCandidate({
    taskMd,
    candidateDiff: input.candidate_diff,
    rubric,
    rubricText,
    rubricHash: await rubricHash(),
    inputHash: input.input_hash,
    judge: { id: "skill-trigger-source-authority", version: "v2" },
    complete,
    systemPrompt: sourceAuthoritySystemPrompt(),
  });
  assertJudgeResultV1(result);
  expect(result.state).toBe("observed");
  expect(result.score).toBe(100);
  expect(result.judge.id).toBe("skill-trigger-source-authority");
});

test("scoreCandidate maps an indeterminate LLM verdict to judge-result indeterminate", async () => {
  const { text: rubricText, doc } = await loadRubric();
  const rubric = assertGeneratedRubric({
    dimensions: doc.dimensions.map((dimension) => ({ id: dimension.id, name: dimension.id, description: dimension.description, max_points: dimension.max_points })),
  });
  const input = await buildJudgeInput({ task_md: taskMd, candidate_diff: diff({ "src/Dashboard.tsx": latestWinsDashboard }), rubric: rubricText });
  const complete = stubCompletion([{ state: "indeterminate", reason: "candidate diff is incomplete", confidence: 40 }]);
  const result = await scoreCandidate({
    taskMd,
    candidateDiff: input.candidate_diff,
    rubric,
    rubricText,
    rubricHash: await rubricHash(),
    inputHash: input.input_hash,
    judge: { id: "skill-trigger-source-authority", version: "v2" },
    complete,
    systemPrompt: sourceAuthoritySystemPrompt(),
  });
  assertJudgeResultV1(result);
  expect(result.state).toBe("indeterminate");
  expect(result.reason).toBe("candidate diff is incomplete");
});

test("provider resolves by id and fails closed without a real judge LLM environment", async () => {
  const provider = resolveJudgeProvider("skill-trigger-source-authority/v1");
  expect(provider).toBeDefined();
  expect(provider!.id).toBe("skill-trigger-source-authority");
  const bare = createSourceAuthorityProvider({});
  const input = await buildJudgeInput({ task_md: taskMd, candidate_diff: diff({ "src/Dashboard.tsx": referenceDashboard }), rubric: await bare.rubricText() });
  await expect(bare.score(input, { judge: { id: "skill-trigger-source-authority", version: "v2" }, prompt: "p", prompt_hash: "0".repeat(64), rubric_hash: "0".repeat(64) })).rejects.toThrow("LORELUM_JUDGE_REAL=1");
});
