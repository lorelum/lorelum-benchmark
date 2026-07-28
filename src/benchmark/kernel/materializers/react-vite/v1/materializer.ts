import { join } from "node:path";
import { copySourceExcludingGenerated } from "../../../core/v1/core";
import type { MaterializeFn } from "../../../core/v1/types";

/**
 * react-vite/v1 materializer: copies declared starter source (excluding
 * generated output) into the target workspace public directory and declares
 * "bun install" as the install command without executing it. The resolved
 * workspace is structurally complete for offline hashing; actual dependency
 * installation is deferred to the execution stage.
 */
export const materialize: MaterializeFn = async (input) => {
  const publicPath = join(input.outputPath, "public");
  await copySourceExcludingGenerated(input.publicStarterPath, publicPath);
  return {
    workspacePath: input.outputPath,
    publicPath,
    installCommand: "bun install",
  };
};
