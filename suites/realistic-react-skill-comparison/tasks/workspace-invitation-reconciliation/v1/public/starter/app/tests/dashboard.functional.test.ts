import { expect, test } from "bun:test";
import { renderWorkspaceDashboard } from "../lib/dashboard-runtime";
import { DeterministicRepository, RepositoryError } from "../lib/repository";

test("dashboard returns the same visible content for the seeded workspace", async () => {
  const model = await renderWorkspaceDashboard(new DeterministicRepository(), "ATLAS");
  expect(model.workspace.name).toBe("Atlas");
  expect(model.quota).toEqual({ used: 32, limit: 100 });
  expect(model.projects.map((project) => project.name)).toEqual(["Launch", "Migration"]);
});

test("dashboard preserves repository errors", async () => {
  await expect(renderWorkspaceDashboard(new DeterministicRepository(), "missing")).rejects.toBeInstanceOf(RepositoryError);
});
