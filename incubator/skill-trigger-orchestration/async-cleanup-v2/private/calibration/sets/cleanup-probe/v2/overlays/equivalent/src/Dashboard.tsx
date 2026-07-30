import { useEffect, useState } from "react";
import { fetchProjects, type ProjectScope, type ProjectSummary } from "./services/projects";

type ViewState =
  | { kind: "loading"; scope: ProjectScope }
  | { kind: "ready"; scope: ProjectScope; projects: ProjectSummary[] }
  | { kind: "error"; scope: ProjectScope; message: string };

const scopeLabel: Record<ProjectScope, string> = { active: "进行中项目", archived: "已归档项目" };

export function Dashboard() {
  const [scope, setScope] = useState<ProjectScope>("active");
  const [state, setState] = useState<ViewState>({ kind: "loading", scope: "active" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: "loading", scope });
    void fetchProjects(scope)
      .then((response) => {
        if (controller.signal.aborted) return;
        setState(response.status === 200
          ? { kind: "ready", scope, projects: response.body.projects }
          : { kind: "error", scope, message: "项目列表暂时不可用" });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ kind: "error", scope, message: "项目列表暂时不可用" });
      });
    return () => controller.abort();
  }, [scope]);

  return <main><section><h1>项目概览</h1><nav aria-label="项目范围">{(Object.keys(scopeLabel) as ProjectScope[]).map((item) => (
    <button key={item} type="button" aria-pressed={scope === item} onClick={() => setScope(item)}>{scopeLabel[item]}</button>
  ))}</nav>{state.kind === "loading" && <p role="status">加载中…</p>}{state.kind === "error" && <p role="alert">{state.message}</p>}{state.kind === "ready" && <ul aria-label={scopeLabel[state.scope]}>{state.projects.map((project) => (
    <li key={project.id}><strong>{project.name}</strong><span> - {project.status === "active" ? "进行中" : "已归档"}</span></li>
  ))}</ul>}</section></main>;
}
