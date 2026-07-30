import { readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const appRoot = resolve(Bun.argv[2] ?? "public/starter/app");
const modeFlag = Bun.argv.indexOf("--mode");
const mode = modeFlag >= 0 ? Bun.argv[modeFlag + 1] : "resolve";
if (mode !== "resolve" && mode !== "reject") throw new Error("--mode must be resolve or reject");

const dashboardPath = join(appRoot, "src", "Dashboard.tsx");
const mainPath = join(appRoot, "src", "main.tsx");
const wrapperPath = join(appRoot, "src", "__lorelum-react.ts");
const testPath = join(appRoot, "tests", "__lorelum-lifecycle.probe.spec.ts");

const wrapper = `import { useEffect, useState as reactUseState, type Dispatch, type SetStateAction } from "react";
export { useEffect };
type ProbeState = typeof globalThis & { __lorelumUnmounted?: boolean; __lorelumSetterCalls?: number };
export function useState<S>(initialState: S | (() => S)): [S, Dispatch<SetStateAction<S>>] {
  const [value, setValue] = reactUseState(initialState);
  const tracked: Dispatch<SetStateAction<S>> = (next) => {
    const probe = globalThis as ProbeState;
    if (probe.__lorelumUnmounted) probe.__lorelumSetterCalls = (probe.__lorelumSetterCalls ?? 0) + 1;
    return setValue(next);
  };
  return [value, tracked];
}
`;

const probeTest = `import { expect, test } from "@playwright/test";
declare global { interface Window { __lorelumReleaseProjectRequest?: () => void; __lorelumUnmountApp?: () => void; __lorelumUnmounted?: boolean; __lorelumSetterCalls?: number; __forceProjectsRejected?: boolean; } }
test("does not call state setters after unmount (${mode})", async ({ page }) => {
  await page.addInitScript((responseMode) => {
    const original = window.setTimeout.bind(window);
    const delayed: Array<() => void> = [];
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      if (timeout === 300 && typeof handler === "function") {
        delayed.push(() => handler(...args));
        return 0 as unknown as number;
      }
      return original(handler, timeout, ...args);
    }) as typeof window.setTimeout;
    window.__lorelumReleaseProjectRequest = () => { for (const release of delayed.splice(0)) release(); };
    window.__lorelumSetterCalls = 0;
    window.__forceProjectsRejected = responseMode === "reject";
  }, ${JSON.stringify(mode)});
  await page.goto("/");
  await page.waitForFunction(() => typeof window.__lorelumReleaseProjectRequest === "function" && typeof window.__lorelumUnmountApp === "function");
  await page.evaluate(() => {
    window.__lorelumUnmounted = true;
    window.__lorelumUnmountApp?.();
    window.__lorelumReleaseProjectRequest?.();
  });
  await page.waitForTimeout(50);
  await expect.poll(() => page.evaluate(() => window.__lorelumSetterCalls)).toBe(0);
});
`;

async function run(): Promise<number> {
  const [dashboard, main] = await Promise.all([readFile(dashboardPath, "utf8"), readFile(mainPath, "utf8")]);
  if (!dashboard.includes('from "react"')) throw new Error("Runtime probe requires src/Dashboard.tsx to import React from react");
  if (!main.includes("const root = createRoot")) throw new Error("Runtime probe requires the v2 app root entrypoint");
  const instrumentedDashboard = dashboard.replace('from "react"', 'from "./__lorelum-react"');
  const instrumentedMain = main.replace("window.__unmountProjectOverview = () => root.unmount();", "window.__unmountProjectOverview = () => root.unmount();\n(globalThis as typeof globalThis & { __lorelumUnmountApp?: () => void }).__lorelumUnmountApp = () => root.unmount();");
  try {
    await Promise.all([writeFile(dashboardPath, instrumentedDashboard), writeFile(mainPath, instrumentedMain), writeFile(wrapperPath, wrapper), writeFile(testPath, probeTest)]);
    const child = Bun.spawn([process.execPath, "run", "test", "--", "tests/__lorelum-lifecycle.probe.spec.ts"], { cwd: appRoot, stdout: "inherit", stderr: "inherit" });
    return await child.exited;
  } finally {
    await Promise.all([writeFile(dashboardPath, dashboard), writeFile(mainPath, main), rm(wrapperPath, { force: true }), rm(testPath, { force: true })]);
  }
}

process.exit(await run());
