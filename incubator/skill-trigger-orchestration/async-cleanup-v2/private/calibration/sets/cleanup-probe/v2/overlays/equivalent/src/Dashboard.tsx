import { useEffect, useState } from "react";
import { fetchProjects, type ProjectSummary } from "./services/projects";

type ViewState =
  | { kind: "loading" }
  | { kind: "ready"; projects: ProjectSummary[] }
  | { kind: "error"; message: string };

export function Dashboard() {
  const [state, setState] = useState<ViewState>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    void fetchProjects()
      .then((response) => {
        if (controller.signal.aborted) return;
        setState(response.status === 200
          ? { kind: "ready", projects: response.body.projects }
          : { kind: "error", message: "项目列表暂时不可用" });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setState({ kind: "error", message: "项目列表暂时不可用" });
      });
    return () => controller.abort();
  }, []);

  if (state.kind === "loading") return <main><section><p role="status">加载中…</p></section></main>;
  if (state.kind === "error") return <main><section><p role="alert">{state.message}</p></section></main>;

  return <main><section><h1>项目概览</h1><ul>{state.projects.map((project) => (
    <li key={project.id}><strong>{project.name}</strong><span> - {project.status === "active" ? "进行中" : "已归档"}</span></li>
  ))}</ul></section></main>;
}
