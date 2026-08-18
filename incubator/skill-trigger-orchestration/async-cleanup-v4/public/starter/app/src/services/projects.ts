export type ProjectSummary = {
  id: string;
  name: string;
  status: "active" | "archived";
};

export type ProjectScope = "active" | "archived";
export type ProjectOperationSource = "navigation" | "manual-reload" | "reconciliation";

export type ProjectsResponse =
  | { status: 200; body: { projects: ProjectSummary[] } }
  | { status: 503; body: { code: "unavailable" } };

declare global {
  interface Window {
    __projectsRequestCount?: number;
    __projectsRequestSources?: ProjectOperationSource[];
    __forceProjectsUnavailableScopes?: ProjectScope[];
    __forceProjectsRejectedScopes?: ProjectScope[];
    __forceProjectsRejectedSources?: ProjectOperationSource[];
  }
}

const projectsByScope: Record<ProjectScope, ProjectSummary[]> = {
  active: [
    { id: "p-1", name: "迁移至 Vite 7", status: "active" },
    { id: "p-2", name: "设计系统重构", status: "active" },
  ],
  archived: [
    { id: "p-3", name: "遗留 API 下线", status: "archived" },
  ],
};

// 后台协调同步后的可见数据：在初始列表基础上新增一项，使“协调结果是否生效”可被用户观察。
const reconciliationProjectsByScope: Record<ProjectScope, ProjectSummary[]> = {
  active: [
    ...projectsByScope.active,
    { id: "p-4", name: "依赖升级已同步", status: "active" },
  ],
  archived: [
    ...projectsByScope.archived,
    { id: "p-5", name: "配置归档已同步", status: "archived" },
  ],
};

export async function fetchProjects(
  scope: ProjectScope,
  source: ProjectOperationSource = "navigation",
): Promise<ProjectsResponse> {
  window.__projectsRequestCount = (window.__projectsRequestCount ?? 0) + 1;
  window.__projectsRequestSources = [...(window.__projectsRequestSources ?? []), source];
  await new Promise((resolve) => window.setTimeout(resolve, 300));

  if (window.__forceProjectsRejectedScopes?.includes(scope) || window.__forceProjectsRejectedSources?.includes(source)) {
    throw new Error("projects request failed");
  }

  if (window.__forceProjectsUnavailableScopes?.includes(scope)) {
    return { status: 503, body: { code: "unavailable" } };
  }

  if (source === "reconciliation") {
    return {
      status: 200,
      body: {
        projects: reconciliationProjectsByScope[scope],
      },
    };
  }

  return {
    status: 200,
    body: {
      projects: projectsByScope[scope],
    },
  };
}
