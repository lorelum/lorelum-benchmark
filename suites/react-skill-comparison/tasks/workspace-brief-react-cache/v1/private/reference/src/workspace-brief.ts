import { cache } from "react";
export interface Workspace { id: string; name: string; }
export interface Quota { seats: number; used: number; }
export interface ProjectSummary { id: string; title: string; }
export interface WorkspaceBrief { workspace: Workspace; quota: Quota; projects: ProjectSummary[]; }
export interface WorkspaceBriefApi { getWorkspace(workspaceId: string): Promise<Workspace | null>; getQuota(workspaceId: string): Promise<Quota>; getPinnedProjectIds(workspaceId: string): Promise<string[]>; getProjectSummaries(projectIds: string[]): Promise<ProjectSummary[]>; }
export type WorkspaceBriefLoader = (input: { workspaceId: string }) => Promise<WorkspaceBrief | null>;
export function createWorkspaceBriefLoader(api: WorkspaceBriefApi): WorkspaceBriefLoader {
  const read = cache(async (workspaceId: string): Promise<WorkspaceBrief | null> => {
    const workspace = api.getWorkspace(workspaceId);
    const quota = api.getQuota(workspaceId);
    const projectIds = workspace.then((value) => value ? api.getPinnedProjectIds(value.id) : null);
    const projects = projectIds.then((value) => value ? api.getProjectSummaries(value) : []);
    const [workspaceValue, quotaValue, projectsValue] = await Promise.all([workspace, quota, projects]);
    return workspaceValue ? { workspace: workspaceValue, quota: quotaValue, projects: projectsValue } : null;
  });
  return ({ workspaceId }) => {
    const normalized = workspaceId.trim();
    return normalized ? read(normalized) : Promise.resolve(null);
  };
}
