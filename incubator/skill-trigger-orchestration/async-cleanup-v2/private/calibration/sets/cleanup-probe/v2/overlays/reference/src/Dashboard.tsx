import { useEffect, useState } from "react";
import { fetchProjects, type ProjectSummary } from "./services/projects";

type ViewState =
  | { kind: "loading" }
  | { kind: "ready"; projects: ProjectSummary[] }
  | { kind: "error"; message: string };

export function Dashboard() {
  const [state, setState] = useState<ViewState>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    fetchProjects()
      .then((response) => {
        if (!active) return;
        if (response.status === 200) {
          setState({ kind: "ready", projects: response.body.projects });
        } else {
          setState({ kind: "error", message: "项目列表暂时不可用" });
        }
      })
      .catch(() => {
        if (!active) return;
        setState({ kind: "error", message: "项目列表暂时不可用" });
      });
    return () => { active = false; };
  }, []);

  if (state.kind === "loading") return <main><section><p role="status">加载中…</p></section></main>;
  if (state.kind === "error") return <main><section><p role="alert">{state.message}</p></section></main>;

  return <main><section><h1>项目概览</h1><ul>{state.projects.map((project) => (
    <li key={project.id}><strong>{project.name}</strong><span> - {project.status === "active" ? "进行中" : "已归档"}</span></li>
  ))}</ul></section></main>;
}
