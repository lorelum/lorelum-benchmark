import { describe, expect, test } from "bun:test";

interface Workspace {
  id: string;
  name: string;
}

interface Viewer {
  id: string;
  displayName: string;
}

interface Project {
  id: string;
  name: string;
}

interface Member {
  id: string;
  role: string;
}

interface AuditEvent {
  id: string;
  action: string;
}

interface WorkspaceApi {
  getWorkspace(workspaceId: string): Promise<Workspace>;
  getViewer(): Promise<Viewer>;
  getProjects(workspaceId: string): Promise<Project[]>;
  getMembers(workspaceId: string): Promise<Member[]>;
  getAuditEvents(workspaceId: string): Promise<AuditEvent[]>;
}

interface WorkspaceOverview {
  workspace: Workspace;
  viewer: Viewer;
  projects: Project[];
  members: Member[];
  auditEvents: AuditEvent[] | null;
}

interface WorkspaceOverviewModule {
  loadWorkspaceOverview(api: WorkspaceApi, input: { workspaceId: string; includeAudit: boolean }): Promise<WorkspaceOverview | null>;
}

interface Deferred<Value> {
  promise: Promise<Value>;
  resolve(value: Value): void;
}

function deferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const candidatePath = Bun.env.CANDIDATE_PATH ?? "suites/react-skill-comparison/tasks/workspace-overview-loader/v1/public/starter/src/workspace-overview.ts";
const candidateUrl = `${Bun.pathToFileURL(candidatePath).href}?run=${Date.now()}`;
const { loadWorkspaceOverview } = (await import(candidateUrl)) as WorkspaceOverviewModule;

describe("workspace-overview-loader-v1", () => {
  test("avoids all I/O for an empty workspace id", async () => {
    let calls = 0;
    const api: WorkspaceApi = {
      async getWorkspace() { calls += 1; throw new Error("unexpected"); },
      async getViewer() { calls += 1; throw new Error("unexpected"); },
      async getProjects() { calls += 1; throw new Error("unexpected"); },
      async getMembers() { calls += 1; throw new Error("unexpected"); },
      async getAuditEvents() { calls += 1; throw new Error("unexpected"); },
    };

    await expect(loadWorkspaceOverview(api, { workspaceId: "   ", includeAudit: true })).resolves.toBeNull();
    expect(calls).toBe(0);
  });

  test("follows the dependency graph without serializing independent work", async () => {
    const calls: string[] = [];
    const workspace = deferred<Workspace>();
    const viewer = deferred<Viewer>();
    const projects = deferred<Project[]>();
    const members = deferred<Member[]>();
    const auditEvents = deferred<AuditEvent[]>();
    const api: WorkspaceApi = {
      getWorkspace(id) { calls.push(`workspace:${id}`); return workspace.promise; },
      getViewer() { calls.push("viewer"); return viewer.promise; },
      getProjects(id) { calls.push(`projects:${id}`); return projects.promise; },
      getMembers(id) { calls.push(`members:${id}`); return members.promise; },
      getAuditEvents(id) { calls.push(`audit:${id}`); return auditEvents.promise; },
    };

    const overview = loadWorkspaceOverview(api, { workspaceId: "acme", includeAudit: true });
    expect(new Set(calls)).toEqual(new Set(["workspace:acme", "viewer"]));
    expect(calls).toHaveLength(2);

    workspace.resolve({ id: "workspace-1", name: "Acme" });
    await Promise.resolve();
    await Promise.resolve();
    expect(new Set(calls)).toEqual(new Set(["workspace:acme", "viewer", "projects:workspace-1", "members:workspace-1", "audit:workspace-1"]));
    expect(calls).toHaveLength(5);

    viewer.resolve({ id: "viewer-1", displayName: "Ari" });
    projects.resolve([{ id: "project-1", name: "Console" }]);
    members.resolve([{ id: "member-1", role: "owner" }]);
    auditEvents.resolve([{ id: "audit-1", action: "created" }]);

    await expect(overview).resolves.toEqual({
      workspace: { id: "workspace-1", name: "Acme" },
      viewer: { id: "viewer-1", displayName: "Ari" },
      projects: [{ id: "project-1", name: "Console" }],
      members: [{ id: "member-1", role: "owner" }],
      auditEvents: [{ id: "audit-1", action: "created" }],
    });
  });

  test("skips optional audit I/O and preserves original errors", async () => {
    const expected = new Error("viewer unavailable");
    let auditCalls = 0;
    const api: WorkspaceApi = {
      async getWorkspace() { return { id: "workspace-1", name: "Acme" }; },
      async getViewer() { throw expected; },
      async getProjects() { return []; },
      async getMembers() { return []; },
      async getAuditEvents() { auditCalls += 1; return []; },
    };

    await expect(loadWorkspaceOverview(api, { workspaceId: "acme", includeAudit: false })).rejects.toBe(expected);
    expect(auditCalls).toBe(0);
  });

  test("preserves errors from dependent requests", async () => {
    const expected = new Error("projects unavailable");
    const api: WorkspaceApi = {
      async getWorkspace() { return { id: "workspace-1", name: "Acme" }; },
      async getViewer() { return { id: "viewer-1", displayName: "Ari" }; },
      async getProjects() { throw expected; },
      async getMembers() { return []; },
      async getAuditEvents() { return []; },
    };

    await expect(loadWorkspaceOverview(api, { workspaceId: "acme", includeAudit: true })).rejects.toBe(expected);
  });
});
