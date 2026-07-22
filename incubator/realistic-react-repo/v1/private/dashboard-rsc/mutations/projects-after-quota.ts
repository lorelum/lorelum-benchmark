import type { DashboardModel } from "./types";
import { DeterministicRepository } from "./repository";

export async function renderWorkspaceDashboard(repository: DeterministicRepository, workspaceId: string): Promise<DashboardModel> {
  const id = workspaceId.trim().toLowerCase();
  const workspace = repository.getWorkspace(id);
  const quota = await repository.getQuota(id);
  const resolvedWorkspace = await workspace;
  const projects = await repository.getRecentProjects(resolvedWorkspace.id);
  return { workspace: resolvedWorkspace, quota, projects };
}
