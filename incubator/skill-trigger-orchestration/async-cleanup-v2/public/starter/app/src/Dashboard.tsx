import { useEffect, useState } from "react";
import { fetchProjects, type ProjectScope, type ProjectSummary } from "./services/projects";

type ViewState =
  | { kind: "loading"; scope: ProjectScope }
  | { kind: "ready"; scope: ProjectScope; projects: ProjectSummary[] }
  | { kind: "error"; scope: ProjectScope; message: string };

const scopeLabel: Record<ProjectScope, string> = {
  active: "进行中项目",
  archived: "已归档项目",
};

export function Dashboard() {
  const [scope, setScope] = useState<ProjectScope>("active");
  const [state, setState] = useState<ViewState>({ kind: "loading", scope: "active" });

  const loadProjects = (nextScope: ProjectScope) => {
    setState({ kind: "loading", scope: nextScope });
    fetchProjects(nextScope)
      .then((response) => {
        if (response.status === 200) {
          setState({ kind: "ready", scope: nextScope, projects: response.body.projects });
        } else {
          setState({ kind: "error", scope: nextScope, message: "项目列表暂时不可用" });
        }
      })
      .catch(() => {
        setState({ kind: "error", scope: nextScope, message: "项目列表暂时不可用" });
      });
  };

  useEffect(() => {
    loadProjects(scope);
  }, [scope]);

  const selectScope = (nextScope: ProjectScope) => {
    if (nextScope !== scope) setScope(nextScope);
  };

  return (
    <main>
      <section>
        <h1>项目概览</h1>
        <nav aria-label="项目范围">
          {(Object.keys(scopeLabel) as ProjectScope[]).map((item) => (
            <button key={item} type="button" aria-pressed={scope === item} onClick={() => selectScope(item)}>
              {scopeLabel[item]}
            </button>
          ))}
        </nav>
        <button type="button" onClick={() => loadProjects(scope)}>重新加载当前范围</button>
        {state.kind === "loading" && <p role="status">加载中…</p>}
        {state.kind === "error" && <p role="alert">{state.message}</p>}
        {state.kind === "ready" && (
          <ul aria-label={scopeLabel[state.scope]}>
            {state.projects.map((project) => (
              <li key={project.id}>
                <strong>{project.name}</strong>
                <span> — {project.status === "active" ? "进行中" : "已归档"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
