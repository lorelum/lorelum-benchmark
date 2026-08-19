import { useEffect, useRef, useState } from "react";
import { fetchProjects, type ProjectOperationSource, type ProjectScope, type ProjectSummary } from "./services/projects";

type ViewState =
  | { kind: "loading"; scope: ProjectScope }
  | { kind: "ready"; scope: ProjectScope; projects: ProjectSummary[] }
  | { kind: "error"; scope: ProjectScope; message: string };

const scopeLabel: Record<ProjectScope, string> = { active: "进行中项目", archived: "已归档项目" };
const WINDOW_MS = 500;

export function Dashboard() {
  const [scope, setScope] = useState<ProjectScope>("active");
  const [state, setState] = useState<ViewState>({ kind: "loading", scope: "active" });
  const foregroundSeq = useRef(0);
  const foregroundStarts = useRef<number[]>([]);
  const pendingForeground = useRef(0);
  const scopeRef = useRef<ProjectScope>("active");

  const loadProjects = (nextScope: ProjectScope, source: ProjectOperationSource) => {
    if (source !== "reconciliation") {
      const operation = ++foregroundSeq.current;
      foregroundStarts.current.push(Date.now());
      pendingForeground.current += 1;
      scopeRef.current = nextScope;
      setState({ kind: "loading", scope: nextScope });
      fetchProjects(nextScope, source)
        .then((response) => {
          pendingForeground.current = Math.max(0, pendingForeground.current - 1);
          if (operation !== foregroundSeq.current || scopeRef.current !== nextScope) return;
          setState(response.status === 200
            ? { kind: "ready", scope: nextScope, projects: response.body.projects }
            : { kind: "error", scope: nextScope, message: "项目列表暂时不可用" });
        })
        .catch(() => {
          pendingForeground.current = Math.max(0, pendingForeground.current - 1);
          if (operation !== foregroundSeq.current || scopeRef.current !== nextScope) return;
          setState({ kind: "error", scope: nextScope, message: "项目列表暂时不可用" });
        });
      return;
    }

    // 后台协调：启动时记录窗口快照，结算时按启动快照与前台代次判定是否生效。
    const startedWithForegroundPending = pendingForeground.current > 0;
    const elapsedSinceForegroundStart = Date.now() - (foregroundStarts.current.at(-1) ?? 0);
    const startedAtForegroundSeq = foregroundSeq.current;
    fetchProjects(nextScope, source)
      .then((response) => {
        if (startedWithForegroundPending || elapsedSinceForegroundStart <= WINDOW_MS) return;
        if (foregroundSeq.current !== startedAtForegroundSeq) return;
        if (scopeRef.current !== nextScope) return;
        setState(response.status === 200
          ? { kind: "ready", scope: nextScope, projects: response.body.projects }
          : { kind: "error", scope: nextScope, message: "项目列表暂时不可用" });
      })
      .catch(() => {
        if (startedWithForegroundPending || elapsedSinceForegroundStart <= WINDOW_MS) return;
        if (foregroundSeq.current !== startedAtForegroundSeq) return;
        if (scopeRef.current !== nextScope) return;
        setState({ kind: "error", scope: nextScope, message: "项目列表暂时不可用" });
      });
  };

  useEffect(() => { loadProjects(scope, "navigation"); }, [scope]);

  return <main><section><h1>项目概览</h1><nav aria-label="项目范围">{(Object.keys(scopeLabel) as ProjectScope[]).map((item) => (
    <button key={item} type="button" aria-pressed={scope === item} onClick={() => setScope(item)}>{scopeLabel[item]}</button>
  ))}</nav><button type="button" onClick={() => loadProjects(scope, "manual-reload")}>重新加载当前范围</button><button type="button" onClick={() => loadProjects(scope, "reconciliation")}>运行后台协调</button>{state.kind === "loading" && <p role="status">加载中…</p>}{state.kind === "error" && <p role="alert">{state.message}</p>}{state.kind === "ready" && <ul aria-label={scopeLabel[state.scope]}>{state.projects.map((project) => (
    <li key={project.id}><strong>{project.name}</strong><span> - {project.status === "active" ? "进行中" : "已归档"}</span></li>
  ))}</ul>}</section></main>;
}
