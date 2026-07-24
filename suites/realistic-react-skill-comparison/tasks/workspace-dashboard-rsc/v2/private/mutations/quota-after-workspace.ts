import type { DashboardModel } from "./types";
import { DeterministicRepository } from "./repository";

export async function renderWorkspaceDashboard(repository: DeterministicRepository, workspaceId: string): Promise<DashboardModel> {
  const id = workspaceId.trim().toLowerCase();
  const workspace = await repository.getWorkspace(id);
  const [quota, projects] = await Promise.all([repository.getQuota(id), repository.getRecentProjects(workspace.id)]);
  return { workspace, quota, projects };
}
