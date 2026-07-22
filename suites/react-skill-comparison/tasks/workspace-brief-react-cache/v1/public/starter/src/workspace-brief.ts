export interface Workspace { id: string; name: string; }
export interface Quota { seats: number; used: number; }
export interface ProjectSummary { id: string; title: string; }
export interface WorkspaceBrief { workspace: Workspace; quota: Quota; projects: ProjectSummary[]; }
export interface WorkspaceBriefApi {
  getWorkspace(workspaceId: string): Promise<Workspace | null>;
  getQuota(workspaceId: string): Promise<Quota>;
  getPinnedProjectIds(workspaceId: string): Promise<string[]>;
  getProjectSummaries(projectIds: string[]): Promise<ProjectSummary[]>;
}
export type WorkspaceBriefLoader = (input: { workspaceId: string }) => Promise<WorkspaceBrief | null>;
export function createWorkspaceBriefLoader(_api: WorkspaceBriefApi): WorkspaceBriefLoader { throw new Error("TODO"); }
