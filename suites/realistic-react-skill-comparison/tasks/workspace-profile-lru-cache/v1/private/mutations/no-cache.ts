import type { WorkspaceProfile, WorkspaceProfileModel } from "./types";
import { DeterministicRepository } from "./repository";

function normalizeWorkspaceId(workspaceId: string): string { return workspaceId.trim().toLowerCase(); }

export async function renderWorkspaceProfile(repository: DeterministicRepository, workspaceId: string): Promise<WorkspaceProfileModel> {
  const profile: WorkspaceProfile = await repository.getWorkspaceProfile(normalizeWorkspaceId(workspaceId));
  return { profile };
}
