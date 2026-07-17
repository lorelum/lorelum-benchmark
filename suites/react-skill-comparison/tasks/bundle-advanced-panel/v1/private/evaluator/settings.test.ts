import { describe, expect, test } from "bun:test";

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
  Bun.env.CANDIDATE_PATH ??
  "suites/react-skill-comparison/tasks/bundle-advanced-panel/v1/public/starter/src/settings.ts";
const candidateUrl = `${Bun.pathToFileURL(candidatePath).href}?run=${Date.now()}`;

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
