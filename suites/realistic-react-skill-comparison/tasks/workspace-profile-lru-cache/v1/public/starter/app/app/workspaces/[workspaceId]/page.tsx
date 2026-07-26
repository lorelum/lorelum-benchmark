import { renderWorkspaceProfile } from "@/lib/workspace-profile-runtime";
import { assertWorkspaceAccess, DeterministicRepository, viewerFor } from "@/lib/repository";

export default async function WorkspacePage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const viewer = viewerFor(workspaceId);
  assertWorkspaceAccess(viewer, workspaceId);
  const model = await renderWorkspaceProfile(new DeterministicRepository(), workspaceId);
  return <main><h1>{model.profile.displayName}</h1><section aria-label="Workspace profile"><p>{model.profile.plan} plan</p><p>{model.profile.memberCount} members</p><p>{model.profile.region}</p></section></main>;
}
