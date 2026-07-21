export interface PublicItem { id: string; title: string; }
export interface MemberItem extends PublicItem { visibility: "public" | "internal"; }
export interface PublicProject { id: string; title: string; publicSummary: string; approved: boolean; publicItems: PublicItem[]; publicItemCount: number; }
export interface MemberProject { id: string; title: string; publicSummary: string; items: MemberItem[]; itemCount: number; internalNote: string; }
export interface ProjectRepository { getPublicProject(projectId: string): PublicProject | null; getMemberProject(organisationId: string, projectId: string): MemberProject | null; }
export type ProjectSummary = { id: string; title: string; summary: string; items: PublicItem[]; itemCount: number } | { id: string; title: string; summary: string; items: MemberItem[]; itemCount: number; internalNote: string };

function anonymousViewer(viewer: unknown): boolean {
  return viewer !== null && typeof viewer === "object" && !Array.isArray(viewer) && (viewer as Record<string, unknown>).role === "anonymous";
}

function memberViewer(viewer: unknown): viewer is { role: "member"; organisationId: string } {
  return viewer !== null
    && typeof viewer === "object"
    && !Array.isArray(viewer)
    && (viewer as Record<string, unknown>).role === "member"
    && typeof (viewer as Record<string, unknown>).organisationId === "string"
    && (viewer as Record<string, unknown>).organisationId.trim().length > 0;
}

export function readProjectSummary(viewer: unknown, projectId: string, repository: ProjectRepository): ProjectSummary | null {
  if (anonymousViewer(viewer)) {
    const project = repository.getPublicProject(projectId);
    if (!project || !project.approved) return null;
    return { id: project.id, title: project.title, summary: project.publicSummary, items: project.publicItems.map((item) => ({ id: item.id, title: item.title })), itemCount: project.publicItemCount };
  }
  if (memberViewer(viewer)) {
    const project = repository.getMemberProject(viewer.organisationId, projectId);
    if (!project) return null;
    return { id: project.id, title: project.title, summary: project.publicSummary, items: project.items.map((item) => ({ id: item.id, title: item.title, visibility: item.visibility })), itemCount: project.itemCount, internalNote: project.internalNote };
  }
  return null;
}
