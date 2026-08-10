import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { cp } from "node:fs/promises";
import { copySourceExcludingGenerated } from "../../../core/v1/core";
import type { MaterializeFn } from "../../../core/v1/types";

/**
 * node-ts/v1 materializer: copies a TypeScript/Bun backend starter source
 * (excluding generated output) into the target workspace public directory and
 * declares "bun install" as the install command without executing it. The
 * resolved workspace is structurally complete for offline hashing; actual
 * dependency installation is deferred to the execution stage.
 */
export const materialize: MaterializeFn = async (input) => {
  const publicPath = join(input.outputPath, "public");
  await mkdir(publicPath);
  await cp(input.publicTaskPath, join(publicPath, "task.md"));
  await copySourceExcludingGenerated(input.publicStarterPath, join(publicPath, "starter"));
  return {
    workspacePath: input.outputPath,
    publicPath,
    installCommand: "bun install",
  };
};