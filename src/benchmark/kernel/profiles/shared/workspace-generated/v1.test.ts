import { expect, test } from "bun:test";
import { isGeneratedWorkspacePath, WORKSPACE_GENERATED_DIRS } from "./v1";

test("workspace generated paths use one canonical directory set", () => {
  expect(WORKSPACE_GENERATED_DIRS).toContain("coverage");
  expect(WORKSPACE_GENERATED_DIRS).toContain("logs");
  expect(isGeneratedWorkspacePath("app/coverage/lcov.info")).toBe(true);
  expect(isGeneratedWorkspacePath("app/logs/run.log")).toBe(true);
  expect(isGeneratedWorkspacePath("app\\coverage\\gateway.ts")).toBe(true);
  expect(isGeneratedWorkspacePath("app/src/gateway.ts")).toBe(false);
});
