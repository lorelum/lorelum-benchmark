import type { DashboardModel } from "./types";
import { DeterministicRepository } from "./repository";

function normalizeWorkspaceId(workspaceId: string): string {
  return workspaceId.trim().toLowerCase();
}

export async function renderWorkspaceDashboard(repository: DeterministicRepository, workspaceId: string): Promise<DashboardModel> {
  const id = normalizeWorkspaceId(workspaceId);
  const reads = new Map<string, Promise<Awaited<ReturnType<DeterministicRepository["getWorkspace"]>>>>();
  const readWorkspace = (key: string) => {
    const existing = reads.get(key);
    if (existing) return existing;
    const next = repository.getWorkspace(key);
    reads.set(key, next);
    return next;
  };

  const workspace = readWorkspace(id);
  const quota = repository.getQuota(id);
  const projects = workspace.then((resolvedWorkspace) => repository.getRecentProjects(resolvedWorkspace.id));
  const [resolvedWorkspace, resolvedQuota, resolvedProjects] = await Promise.all([workspace, quota, projects]);
  return { workspace: resolvedWorkspace, quota: resolvedQuota, projects: resolvedProjects };
}
