import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

interface AdvancedPanel {
  render(): string;
}

interface SettingsModule {
  openAdvancedPanel(): Promise<AdvancedPanel>;
}

interface BenchmarkGlobal {
  __benchmarkModuleLoads?: string[];
}

const candidatePath =
  process.env.CANDIDATE_PATH ??
  "schemas/suites/react-skill-comparison/tasks/bundle-advanced-panel-v1/starter/src/settings.ts";
const candidateUrl = `${pathToFileURL(resolve(candidatePath)).href}?run=${Date.now()}`;

describe("bundle-advanced-panel-v1", () => {
  test("does not load the advanced panel until it is opened", async () => {
    const benchmarkGlobal = globalThis as typeof globalThis & BenchmarkGlobal;
    benchmarkGlobal.__benchmarkModuleLoads = [];

    const { openAdvancedPanel } = (await import(candidateUrl)) as SettingsModule;

    expect(benchmarkGlobal.__benchmarkModuleLoads).toEqual([]);

    const panel = await openAdvancedPanel();

    expect(benchmarkGlobal.__benchmarkModuleLoads).toEqual(["advanced-panel"]);
    expect(panel.render()).toBe("Advanced settings");
  });
});
