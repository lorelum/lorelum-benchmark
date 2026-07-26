import { expect, test } from "bun:test";
import { DeterministicActivity } from "../lib/activity";
import { resolveWorkspaceInvitations } from "../lib/invitation-resolution-runtime";
import { DeterministicRepository, RepositoryError, viewerFor } from "../lib/repository";

test("reconciles a pending invitation without changing the visible workspace", async () => {
  const model = await resolveWorkspaceInvitations(new DeterministicRepository(), new DeterministicActivity(), {
    workspaceId: "ATLAS",
    viewer: viewerFor("atlas"),
    invitationIds: ["inv-a1"],
  });
  expect(model.workspace.name).toBe("Atlas");
  expect(model.resolvedInvitationIds).toEqual(["inv-a1"]);
});

test("preserves repository errors for another workspace invitation", async () => {
  await expect(resolveWorkspaceInvitations(new DeterministicRepository(), new DeterministicActivity(), {
    workspaceId: "atlas",
    viewer: viewerFor("atlas"),
    invitationIds: ["inv-n1"],
  })).rejects.toBeInstanceOf(RepositoryError);
});
