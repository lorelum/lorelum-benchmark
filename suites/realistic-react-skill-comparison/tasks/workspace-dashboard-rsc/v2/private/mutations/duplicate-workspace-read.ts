import type { DashboardModel } from "./types";
import { DeterministicRepository } from "./repository";

export async function renderWorkspaceDashboard(repository: DeterministicRepository, workspaceId: string): Promise<DashboardModel> {
  const id = workspaceId.trim().toLowerCase();
  const workspace = repository.getWorkspace(id);
  const quota = repository.getQuota(id);
  const projects = repository.getWorkspace(id).then((value) => repository.getRecentProjects(value.id));
  const [resolvedWorkspace, resolvedQuota, resolvedProjects] = await Promise.all([workspace, quota, projects]);
  return { workspace: resolvedWorkspace, quota: resolvedQuota, projects: resolvedProjects };
}
