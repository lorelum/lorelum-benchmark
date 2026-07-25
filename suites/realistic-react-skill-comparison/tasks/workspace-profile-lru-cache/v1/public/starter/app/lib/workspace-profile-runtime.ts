import type { WorkspaceProfile, WorkspaceProfileModel } from "./types";
import { DeterministicRepository } from "./repository";

function normalizeWorkspaceId(workspaceId: string): string {
  return workspaceId.trim().toLowerCase();
}

function model(profile: WorkspaceProfile): WorkspaceProfileModel {
  return { profile };
}

export async function renderWorkspaceProfile(repository: DeterministicRepository, workspaceId: string): Promise<WorkspaceProfileModel> {
  return model(await repository.getWorkspaceProfile(normalizeWorkspaceId(workspaceId)));
}
