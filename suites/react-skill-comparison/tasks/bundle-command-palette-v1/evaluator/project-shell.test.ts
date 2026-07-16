import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

interface ProjectShellModule {
  openCommandPalette(query: string): Promise<string[]>;
}

interface BenchmarkGlobal {
  __benchmarkModuleLoads?: string[];
}

const candidatePath =
  process.env.CANDIDATE_PATH ??
  "suites/react-skill-comparison/tasks/bundle-command-palette-v1/starter/src/project-shell.ts";
const candidateUrl = `${pathToFileURL(resolve(candidatePath)).href}?run=${Date.now()}`;

describe("bundle-command-palette-v1", () => {
  test("does not load the command index until the palette opens", async () => {
    const benchmarkGlobal = globalThis as typeof globalThis & BenchmarkGlobal;
    benchmarkGlobal.__benchmarkModuleLoads = [];

    const { openCommandPalette } =
      (await import(candidateUrl)) as ProjectShellModule;

    expect(benchmarkGlobal.__benchmarkModuleLoads).toEqual([]);

    await expect(openCommandPalette("search")).resolves.toEqual(["Search issues"]);
    expect(benchmarkGlobal.__benchmarkModuleLoads).toEqual(["command-index"]);
  });
});
