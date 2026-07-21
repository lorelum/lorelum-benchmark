export interface PublicItem { id: string; title: string; }
export interface MemberItem extends PublicItem { visibility: "public" | "internal"; }
export interface PublicProject { id: string; title: string; publicSummary: string; approved: boolean; publicItems: PublicItem[]; publicItemCount: number; }
export interface MemberProject { id: string; title: string; publicSummary: string; items: MemberItem[]; itemCount: number; internalNote: string; }
export interface ProjectRepository { getPublicProject(projectId: string): PublicProject | null; getMemberProject(organisationId: string, projectId: string): MemberProject | null; }
export type ProjectSummary = { id: string; title: string; summary: string; items: PublicItem[]; itemCount: number } | { id: string; title: string; summary: string; items: MemberItem[]; itemCount: number; internalNote: string };

export function readProjectSummary(viewer: unknown, projectId: string, repository: ProjectRepository): ProjectSummary | null {
  const member = viewer as { organisationId?: string };
  const project = repository.getMemberProject(member.organisationId ?? "", projectId);
  if (!project) return null;
  return { id: project.id, title: project.title, summary: project.publicSummary, items: project.items, itemCount: project.itemCount, internalNote: project.internalNote };
}
