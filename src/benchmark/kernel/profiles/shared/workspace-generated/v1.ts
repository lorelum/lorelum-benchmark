/** Generated workspace areas that never contribute to two-stage candidate identity. */
export const WORKSPACE_GENERATED_DIRS = [
  "node_modules",
  "dist",
  "coverage",
  "logs",
  "test-results",
  "playwright-report",
  ".git",
  ".vite",
  ".materialized",
  ".practice-runtime",
  ".run-workspaces",
] as const;

export function isGeneratedWorkspacePath(relativePath: string): boolean {
  return relativePath.replaceAll("\\", "/").split("/").some((segment) => (WORKSPACE_GENERATED_DIRS as readonly string[]).includes(segment));
}
