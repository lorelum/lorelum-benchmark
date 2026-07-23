import type { Member, Project, Quota, TraceEvent, Viewer, Workspace } from "./types";

const workspaces: Record<string, Workspace> = {
  atlas: { id: "atlas", name: "Atlas", plan: "pro", memberCount: 4 },
  empty: { id: "empty", name: "Empty", plan: "starter", memberCount: 1 },
};
const projects: Record<string, readonly Project[]> = {
  atlas: [{ id: "p1", name: "Launch", updatedAt: "2026-07-01" }, { id: "p2", name: "Migration", updatedAt: "2026-07-02" }],
  empty: [],
};
const members: readonly Member[] = [
  { id: "m1", name: "Ada", role: "admin", internalNote: "on-call" },
  { id: "m2", name: "Lin", role: "member", internalNote: "contractor" },
];

export class RepositoryError extends Error {}

export type RepositoryGates = Partial<Record<"workspace" | "quota" | "projects", Promise<void>>>;

export class DeterministicRepository {
  readonly trace: TraceEvent[] = [];
  private sequence = 0;
  private readonly gates: RepositoryGates;

  constructor(options: { gates?: RepositoryGates } = {}) {
    this.gates = options.gates ?? {};
  }

  private record(operation: string, key: string): void {
    this.trace.push({ operation, key, sequence: ++this.sequence });
  }

  async getWorkspace(id: string): Promise<Workspace> {
    this.record("workspace", id);
    await this.gates.workspace;
    const workspace = workspaces[id];
    if (!workspace) throw new RepositoryError(`Workspace ${id} does not exist`);
    return workspace;
  }

  async getQuota(id: string): Promise<Quota> {
    this.record("quota", id);
    await this.gates.quota;
    if (!workspaces[id]) throw new RepositoryError(`Workspace ${id} does not exist`);
    return id === "atlas" ? { used: 32, limit: 100 } : { used: 0, limit: 5 };
  }

  async getRecentProjects(workspaceId: string): Promise<readonly Project[]> {
    this.record("projects", workspaceId);
    await this.gates.projects;
    if (!workspaces[workspaceId]) throw new RepositoryError(`Workspace ${workspaceId} does not exist`);
    return projects[workspaceId] ?? [];
  }

  async getMembers(viewer: Viewer): Promise<readonly Member[]> {
    this.record("members", viewer.id);
    return members;
  }

  async getReport(reportId: string): Promise<{ id: string; title: string; series: readonly number[] }> {
    this.record("report", reportId);
    return { id: reportId, title: "Adoption", series: [3, 5, 8, 13] };
  }
}

export function viewerFor(workspaceId: string): Viewer {
  return { id: "viewer-atlas", workspaceIds: workspaceId === "atlas" || workspaceId === "empty" ? [workspaceId] : [], canViewReports: workspaceId === "atlas" };
}

export function assertWorkspaceAccess(viewer: Viewer, workspaceId: string): void {
  if (!viewer.workspaceIds.includes(workspaceId)) throw new RepositoryError("Workspace access denied");
}
