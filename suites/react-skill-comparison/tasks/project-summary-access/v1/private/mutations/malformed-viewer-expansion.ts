export function readProjectSummary(viewer: any, projectId: string, repository: any) {
  const project = repository.getMemberProject(viewer.organisationId, projectId);
  return project ? { id: project.id, title: project.title, summary: project.publicSummary, items: project.items, itemCount: project.itemCount, internalNote: project.internalNote } : null;
}
