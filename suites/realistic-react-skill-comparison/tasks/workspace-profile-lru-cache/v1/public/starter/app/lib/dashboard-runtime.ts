import type { DashboardModel } from "./types";
import { DeterministicRepository } from "./repository";

function normalizeWorkspaceId(workspaceId: string): string {
  return workspaceId.trim().toLowerCase();
}

export async function renderWorkspaceDashboard(repository: DeterministicRepository, workspaceId: string): Promise<DashboardModel> {
  const id = normalizeWorkspaceId(workspaceId);
  const workspace = await repository.getWorkspace(id);
  const quota = await repository.getQuota(id);
  const projectWorkspace = await repository.getWorkspace(id);
  const projects = await repository.getRecentProjects(projectWorkspace.id);
  return { workspace, quota, projects };
}
