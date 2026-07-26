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

  const policies = input.invitationIds.length === 0
    ? [await repository.getInvitationPolicy(workspaceId)]
    : await Promise.all(input.invitationIds.map(() => repository.getInvitationPolicy(workspaceId)));
  const requested = input.invitationIds.map((invitationId) => invitationId.trim()).filter(Boolean);
  const invitations = await Promise.all([...new Set(requested)].map((invitationId) => repository.getInvitation(workspaceId, invitationId)));
  const pending = invitations.filter((invitation) => invitation.status === "pending");
  const resolvedInvitationIds = pending.length === 0 ? [] : await repository.reconcileInvitations(workspaceId, pending.map((invitation) => invitation.id));
  const result = model(workspace, invitations, resolvedInvitationIds);
  const policy = policies[0];
  if (!policy || policy.maximumResolutions < resolvedInvitationIds.length) throw new Error("Invitation policy does not allow this reconciliation");
  await activity.record({ workspaceId, actorId: input.viewer.id, invitationIds: resolvedInvitationIds });
  return result;
}
