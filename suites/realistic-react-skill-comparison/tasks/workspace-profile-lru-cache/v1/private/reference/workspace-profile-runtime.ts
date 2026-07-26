import type { WorkspaceProfile, WorkspaceProfileModel } from "./types";
import { DeterministicRepository } from "./repository";

const capacity = 2;
const profiles = new Map<string, WorkspaceProfile>();

function normalizeWorkspaceId(workspaceId: string): string {
  return workspaceId.trim().toLowerCase();
}

async function readProfile(repository: DeterministicRepository, id: string): Promise<WorkspaceProfile> {
  const cached = profiles.get(id);
  if (cached) {
    profiles.delete(id);
    profiles.set(id, cached);
    return cached;
  }

  const profile = Object.freeze({ ...(await repository.getWorkspaceProfile(id)) }) as WorkspaceProfile;
  if (profiles.size === capacity) profiles.delete(profiles.keys().next().value!);
  profiles.set(id, profile);
  return profile;
}

export async function renderWorkspaceProfile(repository: DeterministicRepository, workspaceId: string): Promise<WorkspaceProfileModel> {
  return { profile: await readProfile(repository, normalizeWorkspaceId(workspaceId)) };
}
