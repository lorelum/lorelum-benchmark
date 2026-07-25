import type { WorkspaceProfile, WorkspaceProfileModel } from "./types";
import { DeterministicRepository } from "./repository";

const profiles = new Map<string, WorkspaceProfile>();

function normalizeWorkspaceId(workspaceId: string): string { return workspaceId.trim().toLowerCase(); }

export async function renderWorkspaceProfile(repository: DeterministicRepository, workspaceId: string): Promise<WorkspaceProfileModel> {
  const id = normalizeWorkspaceId(workspaceId);
  const cached = profiles.get(id);
  if (cached) return { profile: cached };
  const profile = await repository.getWorkspaceProfile(id);
  profiles.set(id, profile);
  return { profile };
}
