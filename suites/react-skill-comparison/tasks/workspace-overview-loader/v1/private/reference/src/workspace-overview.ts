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

export async function loadWorkspaceOverview(
  api: WorkspaceApi,
  input: { workspaceId: string; includeAudit: boolean },
): Promise<WorkspaceOverview | null> {
  const workspaceId = input.workspaceId.trim();
  if (!workspaceId) return null;

  const workspacePromise = api.getWorkspace(workspaceId);
  const viewerPromise = api.getViewer();
  const workspace = await workspacePromise;
  const dependentDataPromise = Promise.all([
    api.getProjects(workspace.id),
    api.getMembers(workspace.id),
    input.includeAudit ? api.getAuditEvents(workspace.id) : Promise.resolve<AuditEvent[] | null>(null),
  ]);
  const [viewer, [projects, members, auditEvents]] = await Promise.all([viewerPromise, dependentDataPromise]);
  return { workspace, viewer, projects, members, auditEvents };
}
