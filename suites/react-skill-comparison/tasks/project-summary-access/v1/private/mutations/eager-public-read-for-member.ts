export function readProjectSummary(viewer: any, projectId: string, repository: any) {
  if (viewer?.role === "anonymous") { const project = repository.getPublicProject(projectId); return project?.approved ? { id: project.id, title: project.title, summary: project.publicSummary, items: project.publicItems.map((item: any) => ({ id: item.id, title: item.title })), itemCount: project.publicItemCount } : null; }
  if (viewer?.role === "member" && typeof viewer.organisationId === "string" && viewer.organisationId.trim()) { repository.getPublicProject(projectId); const project = repository.getMemberProject(viewer.organisationId, projectId); return project ? { id: project.id, title: project.title, summary: project.publicSummary, items: project.items.map((item: any) => ({ id: item.id, title: item.title, visibility: item.visibility })), itemCount: project.itemCount, internalNote: project.internalNote } : null; }
  return null;
}
