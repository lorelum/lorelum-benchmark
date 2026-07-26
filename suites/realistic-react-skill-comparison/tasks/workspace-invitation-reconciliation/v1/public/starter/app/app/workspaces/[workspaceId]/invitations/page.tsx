import { DeterministicActivity } from "@/lib/activity";
import { resolveWorkspaceInvitations } from "@/lib/invitation-resolution-runtime";
import { DeterministicRepository, viewerFor } from "@/lib/repository";

export default async function WorkspaceInvitationsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const model = await resolveWorkspaceInvitations(new DeterministicRepository(), new DeterministicActivity(), {
    workspaceId,
    viewer: viewerFor(workspaceId),
    invitationIds: [],
  });
  return <main><h1>{model.workspace.name} invitations</h1><p>{model.pendingInvitationIds.length} pending invitations</p></main>;
}
