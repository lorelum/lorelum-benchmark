import type { WorkspaceProfile, WorkspaceProfileModel } from "./types";
import { DeterministicRepository } from "./repository";

const capacity = 2;
const profiles = new Map<string, WorkspaceProfile>();
let currentProfile: WorkspaceProfile | undefined;

function normalizeWorkspaceId(workspaceId: string): string { return workspaceId.trim().toLowerCase(); }

export async function renderWorkspaceProfile(repository: DeterministicRepository, workspaceId: string): Promise<WorkspaceProfileModel> {
  const id = normalizeWorkspaceId(workspaceId);
  const cached = profiles.get(id);
  if (cached) {
    profiles.delete(id);
    profiles.set(id, cached);
    return { profile: cached };
  }
  currentProfile = await repository.getWorkspaceProfile(id);
  if (profiles.size === capacity) profiles.delete(profiles.keys().next().value!);
  profiles.set(id, currentProfile);
  await Promise.resolve();
  return { profile: currentProfile };
}
