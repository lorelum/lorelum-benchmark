import { DeterministicActivity } from "./activity";
import { assertWorkspaceAccess, DeterministicRepository } from "./repository";
import type { InvitationReconciliationModel, InvitationResolutionInput, WorkspaceInvitation } from "./types";

function normalizeWorkspaceId(workspaceId: string): string {
  return workspaceId.trim().toLowerCase();
}

function model(workspace: InvitationReconciliationModel["workspace"], invitations: readonly WorkspaceInvitation[], resolvedInvitationIds: readonly string[]): InvitationReconciliationModel {
  return {
    workspace,
    resolvedInvitationIds,
    pendingInvitationIds: invitations.filter((invitation) => invitation.status === "pending").map((invitation) => invitation.id),
  };
}

export async function resolveWorkspaceInvitations(repository: DeterministicRepository, activity: DeterministicActivity, input: InvitationResolutionInput): Promise<InvitationReconciliationModel> {
  const workspaceId = normalizeWorkspaceId(input.workspaceId);
  const workspace = await repository.getWorkspace(workspaceId);
  assertWorkspaceAccess(input.viewer, workspaceId);
  const invitationIds = [...new Set(input.invitationIds.map((invitationId) => invitationId.trim()).filter(Boolean))];
  if (invitationIds.length === 0) return model(workspace, [], []);

  const invitations = await Promise.all(invitationIds.map((invitationId) => repository.getInvitation(workspaceId, invitationId)));
  const pending = invitations.filter((invitation) => invitation.status === "pending");
  if (pending.length === 0) return model(workspace, invitations, []);

  const policy = await repository.getInvitationPolicy(workspaceId);
  if (policy.maximumResolutions < pending.length) throw new Error("Invitation policy does not allow this reconciliation");
  const resolvedInvitationIds = await repository.reconcileInvitations(workspaceId, pending.map((invitation) => invitation.id));
  if (resolvedInvitationIds.length > 0) {
    activity.after(() => activity.record({ workspaceId, actorId: input.viewer.id, invitationIds: resolvedInvitationIds }));
  }
  return model(workspace, invitations, resolvedInvitationIds);
}
