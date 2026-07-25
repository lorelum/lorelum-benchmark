export interface Workspace {
  id: string;
  name: string;
}

export interface Viewer {
  id: string;
  displayName: string;
}

export interface Project {
  id: string;
  name: string;
}

export interface Member {
  id: string;
  role: string;
}

export interface AuditEvent {
  id: string;
  action: string;
}

export interface WorkspaceApi {
  getWorkspace(workspaceId: string): Promise<Workspace>;
  getViewer(): Promise<Viewer>;
  getProjects(workspaceId: string): Promise<Project[]>;
  getMembers(workspaceId: string): Promise<Member[]>;
  getAuditEvents(workspaceId: string): Promise<AuditEvent[]>;
}

export interface WorkspaceOverview {
  workspace: Workspace;
  viewer: Viewer;
  projects: Project[];
  members: Member[];
  auditEvents: AuditEvent[] | null;
}

export interface WorkspaceOverviewInput {
  workspaceId: string;
  includeAudit: boolean;
}

export async function loadWorkspaceOverview(
  api: WorkspaceApi,
  input: WorkspaceOverviewInput,
): Promise<WorkspaceOverview | null> {
  const workspaceId = input.workspaceId.trim();
  if (!workspaceId) return null;

  const workspace = await api.getWorkspace(workspaceId);
  const viewer = await api.getViewer();
  const projects = await api.getProjects(workspace.id);
  const members = await api.getMembers(workspace.id);
  const auditEvents = input.includeAudit
    ? await api.getAuditEvents(workspace.id)
    : null;

  return { workspace, viewer, projects, members, auditEvents };
}
