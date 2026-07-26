import type { InvitationPolicy, Member, Project, Quota, TraceEvent, Viewer, Workspace, WorkspaceInvitation } from "./types";

const workspaces: Record<string, Workspace> = {
  atlas: { id: "atlas", name: "Atlas", plan: "pro", memberCount: 4 },
  empty: { id: "empty", name: "Empty", plan: "starter", memberCount: 1 },
  nova: { id: "nova", name: "Nova", plan: "pro", memberCount: 2 },
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

const invitations: Record<string, WorkspaceInvitation> = {
  "inv-a1": { id: "inv-a1", workspaceId: "atlas", email: "ada@example.com", status: "pending" },
  "inv-a2": { id: "inv-a2", workspaceId: "atlas", email: "lin@example.com", status: "resolved" },
  "inv-e1": { id: "inv-e1", workspaceId: "empty", email: "kai@example.com", status: "pending" },
  "inv-n1": { id: "inv-n1", workspaceId: "nova", email: "noa@example.com", status: "pending" },
};

export type RepositoryGates = Partial<Record<"workspace" | "quota" | "projects" | "invitations" | "policy", Promise<void>>>;

export class DeterministicRepository {
  readonly trace: TraceEvent[] = [];
  private sequence = 0;
  private readonly gates: RepositoryGates;
  private readonly invitationState: Map<string, WorkspaceInvitation>;

  constructor(options: { gates?: RepositoryGates } = {}) {
    this.gates = options.gates ?? {};
    this.invitationState = new Map(Object.values(invitations).map((invitation) => [invitation.id, { ...invitation }]));
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

  async getInvitation(workspaceId: string, invitationId: string): Promise<WorkspaceInvitation> {
    this.record("invitation", invitationId);
    await this.gates.invitations;
    const invitation = this.invitationState.get(invitationId);
    if (!invitation) throw new RepositoryError(`Invitation ${invitationId} does not exist`);
    if (invitation.workspaceId !== workspaceId) throw new RepositoryError("Invitation does not belong to this workspace");
    return { ...invitation };
  }

  async getInvitationPolicy(workspaceId: string): Promise<InvitationPolicy> {
    this.record("policy", workspaceId);
    await this.gates.policy;
    if (!workspaces[workspaceId]) throw new RepositoryError(`Workspace ${workspaceId} does not exist`);
    return { workspaceId, maximumResolutions: 10 };
  }

  async reconcileInvitations(workspaceId: string, invitationIds: readonly string[]): Promise<readonly string[]> {
    this.record("reconcile", workspaceId);
    if (!workspaces[workspaceId]) throw new RepositoryError(`Workspace ${workspaceId} does not exist`);
    const changed: string[] = [];
    for (const invitationId of invitationIds) {
      const invitation = this.invitationState.get(invitationId);
      if (!invitation || invitation.workspaceId !== workspaceId) throw new RepositoryError("Invitation does not belong to this workspace");
      if (invitation.status === "pending") {
        invitation.status = "resolved";
        changed.push(invitation.id);
      }
    }
    return changed;
  }
}

export function viewerFor(workspaceId: string): Viewer {
  return { id: `viewer-${workspaceId}`, workspaceIds: Object.hasOwn(workspaces, workspaceId) ? [workspaceId] : [], canViewReports: workspaceId === "atlas" };
}

export function assertWorkspaceAccess(viewer: Viewer, workspaceId: string): void {
  if (!viewer.workspaceIds.includes(workspaceId)) throw new RepositoryError("Workspace access denied");
}
