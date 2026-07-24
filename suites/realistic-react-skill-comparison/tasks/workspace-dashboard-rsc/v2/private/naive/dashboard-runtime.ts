import type { DashboardModel } from "./types";
import { DeterministicRepository } from "./repository";

// The independently authored naive control is semantically valid but makes
// every server operation wait for the preceding one.
export async function renderWorkspaceDashboard(repository: DeterministicRepository, workspaceId: string): Promise<DashboardModel> {
  const id = workspaceId.trim().toLowerCase();
  const workspace = await repository.getWorkspace(id);
  const quota = await repository.getQuota(id);
  const projectWorkspace = await repository.getWorkspace(id);
  const projects = await repository.getRecentProjects(projectWorkspace.id);
  return { workspace, quota, projects };
}
