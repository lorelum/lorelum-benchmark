export type Workspace = { id: string; name: string; plan: "pro" | "starter"; memberCount: number };
export type Project = { id: string; name: string; updatedAt: string };
export type Quota = { used: number; limit: number };
export type Member = { id: string; name: string; role: "admin" | "member"; internalNote: string };

export type Viewer = { id: string; workspaceIds: readonly string[]; canViewReports: boolean };
export type TraceEvent = { operation: string; key: string; sequence: number };
export type DashboardModel = { workspace: Workspace; quota: Quota; projects: readonly Project[] };
