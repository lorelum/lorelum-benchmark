export type ProjectSummary = { id: string; name: string; status: "active" | "archived" };
export type ProjectScope = "active" | "archived";
export type ProjectsResponse = { status: 200; body: { projects: ProjectSummary[] } } | { status: 503; body: { code: "unavailable" } };

declare global {
  interface Window {
    __projectsRequestCount?: number;
    __forceProjectsUnavailableScopes?: ProjectScope[];
    __forceProjectsRejectedScopes?: ProjectScope[];
  }
}

const projectsByScope: Record<ProjectScope, ProjectSummary[]> = {
  active: [{ id: "p-1", name: "迁移至 Vite 7", status: "active" }, { id: "p-2", name: "设计系统重构", status: "active" }],
  archived: [{ id: "p-3", name: "遗留 API 下线", status: "archived" }],
};

export async function fetchProjects(scope: ProjectScope): Promise<ProjectsResponse> {
  window.__projectsRequestCount = (window.__projectsRequestCount ?? 0) + 1;
  await new Promise((resolve) => window.setTimeout(resolve, 300));
  if (window.__forceProjectsRejectedScopes?.includes(scope)) throw new Error("projects request failed");
  if (window.__forceProjectsUnavailableScopes?.includes(scope)) return { status: 503, body: { code: "unavailable" } };
  return { status: 200, body: { projects: projectsByScope[scope] } };
}
