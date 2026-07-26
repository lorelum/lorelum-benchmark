import type { WorkspaceProfile, WorkspaceProfileModel } from "./types";
import { DeterministicRepository } from "./repository";

const capacity = 2;
const profiles = new Map<string, Promise<WorkspaceProfile>>();

function normalizeWorkspaceId(workspaceId: string): string { return workspaceId.trim().toLowerCase(); }

export async function renderWorkspaceProfile(repository: DeterministicRepository, workspaceId: string): Promise<WorkspaceProfileModel> {
  const id = normalizeWorkspaceId(workspaceId);
  let profile = profiles.get(id);
  if (!profile) {
    profile = repository.getWorkspaceProfile(id);
    if (profiles.size === capacity) profiles.delete(profiles.keys().next().value!);
    profiles.set(id, profile);
  } else {
    profiles.delete(id);
    profiles.set(id, profile);
  }
  return { profile: await profile };
}
