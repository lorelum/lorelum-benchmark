export type ProjectSummary = {
  id: string;
  name: string;
  status: "active" | "archived";
};

export type ProjectsResponse =
  | { status: 200; body: { projects: ProjectSummary[] } }
  | { status: 503; body: { code: "unavailable" } };

declare global {
  interface Window {
    __projectsRequestCount?: number;
  }
}

export async function fetchProjects(): Promise<ProjectsResponse> {
  window.__projectsRequestCount = (window.__projectsRequestCount ?? 0) + 1;
  await new Promise((resolve) => window.setTimeout(resolve, 300));

  if (window.__forceProjectsUnavailable) {
    return { status: 503, body: { code: "unavailable" } };
  }

  return {
    status: 200,
    body: {
      projects: [
        { id: "p-1", name: "迁移至 Vite 7", status: "active" },
        { id: "p-2", name: "设计系统重构", status: "active" },
        { id: "p-3", name: "遗留 API 下线", status: "archived" },
      ],
    },
  };
}
