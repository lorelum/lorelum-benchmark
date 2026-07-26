import { expect, test } from "bun:test";
import { renderWorkspaceProfile } from "../lib/workspace-profile-runtime";
import { DeterministicRepository, RepositoryError } from "../lib/repository";

test("profile returns the visible content for the seeded workspace", async () => {
  const model = await renderWorkspaceProfile(new DeterministicRepository(), "ATLAS");
  expect(model.profile).toEqual({ workspaceId: "atlas", displayName: "Atlas", plan: "pro", memberCount: 4, region: "us-east" });
});

test("profile preserves repository errors", async () => {
  await expect(renderWorkspaceProfile(new DeterministicRepository(), "missing")).rejects.toBeInstanceOf(RepositoryError);
});
