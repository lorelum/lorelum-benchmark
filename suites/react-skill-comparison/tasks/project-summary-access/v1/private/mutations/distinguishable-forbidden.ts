export function readProjectSummary(viewer: any, projectId: string, repository: any) {
  if (viewer?.role === "anonymous") { const project = repository.getPublicProject(projectId); return project?.approved ? { id: project.id, title: project.title, summary: project.publicSummary, items: project.publicItems, itemCount: project.publicItemCount } : null; }
  if (viewer?.role === "member" && typeof viewer.organisationId === "string") { const project = repository.getMemberProject(viewer.organisationId, projectId); return project ? { id: project.id, title: project.title, summary: project.publicSummary, items: project.items, itemCount: project.itemCount, internalNote: project.internalNote } : { error: "forbidden" }; }
  return null;
}
