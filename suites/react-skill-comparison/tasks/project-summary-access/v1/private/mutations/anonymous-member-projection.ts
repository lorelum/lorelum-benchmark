export function readProjectSummary(viewer: any, projectId: string, repository: any) {
  if (viewer?.role === "anonymous") {
    const project = repository.getMemberProject("north", projectId);
    return project ? { id: project.id, title: project.title, summary: project.publicSummary, items: project.items, itemCount: project.itemCount, internalNote: project.internalNote } : null;
  }
  if (viewer?.role === "member" && typeof viewer.organisationId === "string") {
    const project = repository.getMemberProject(viewer.organisationId, projectId);
    return project ? { id: project.id, title: project.title, summary: project.publicSummary, items: project.items, itemCount: project.itemCount, internalNote: project.internalNote } : null;
  }
  return null;
}
