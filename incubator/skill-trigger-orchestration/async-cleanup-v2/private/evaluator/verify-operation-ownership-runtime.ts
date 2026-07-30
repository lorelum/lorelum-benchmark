import { readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

type Mode = "scope-resolve" | "scope-reject" | "reload-resolve" | "reload-reject";

const appRoot = resolve(Bun.argv[2] ?? "public/starter/app");
const modeFlag = Bun.argv.indexOf("--mode");
const mode = modeFlag >= 0 ? Bun.argv[modeFlag + 1] as Mode : "scope-resolve";
if (!(["scope-resolve", "scope-reject", "reload-resolve", "reload-reject"] as string[]).includes(mode)) {
  throw new Error("--mode must be scope-resolve, scope-reject, reload-resolve, or reload-reject");
}

const dashboardPath = join(appRoot, "src", "Dashboard.tsx");
const wrapperPath = join(appRoot, "src", "__lorelum-react.ts");
const testPath = join(appRoot, "tests", "__lorelum-operation-ownership.probe.spec.ts");

const wrapper = `import { useState as reactUseState, type Dispatch, type SetStateAction } from "react";
export { useEffect, useRef, useCallback, useMemo, useReducer } from "react";
type ProbeState = typeof globalThis & { __lorelumTrackStaleWrites?: boolean; __lorelumSetterCalls?: number };
export function useState<S>(initialState: S | (() => S)): [S, Dispatch<SetStateAction<S>>] {
  const [value, setValue] = reactUseState(initialState);
  const tracked: Dispatch<SetStateAction<S>> = (next) => {
    const probe = globalThis as ProbeState;
    if (probe.__lorelumTrackStaleWrites) probe.__lorelumSetterCalls = (probe.__lorelumSetterCalls ?? 0) + 1;
    return setValue(next);
  };
  return [value, tracked];
}
`;

const probeTest = `import { expect, test } from "@playwright/test";
declare global { interface Window { __lorelumReleaseLatestProjectRequest?: () => void; __lorelumReleasePendingProjectRequests?: () => void; __lorelumTrackStaleWrites?: boolean; __lorelumSetterCalls?: number; __forceProjectsRejectedScopes?: string[]; } }
test("does not update state from a superseded project operation (${mode})", async ({ page }) => {
  await page.addInitScript(() => {
    const original = window.setTimeout.bind(window);
    const delayed: Array<() => void> = [];
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      if (timeout === 300 && typeof handler === "function") {
        delayed.push(() => handler(...args));
        return 0 as unknown as number;
      }
      return original(handler, timeout, ...args);
    }) as typeof window.setTimeout;
    window.__lorelumReleaseLatestProjectRequest = () => { delayed.pop()?.(); };
    window.__lorelumReleasePendingProjectRequests = () => { for (const release of delayed.splice(0)) release(); };
    window.__lorelumSetterCalls = 0;
  });
  await page.goto("/");
  await page.waitForFunction(() => typeof window.__lorelumReleaseLatestProjectRequest === "function");
  const sameScope = ${JSON.stringify(mode.startsWith("reload-"))};
  if (sameScope) {
    await page.getByRole("button", { name: "重新加载当前范围" }).click();
  } else {
    await page.getByRole("button", { name: "已归档项目" }).click();
  }
  await page.evaluate(() => window.__lorelumReleaseLatestProjectRequest?.());
  await expect(page.getByRole("list", { name: sameScope ? "进行中项目" : "已归档项目" })).toBeVisible();
  if (${JSON.stringify(mode.endsWith("reject"))}) {
    await page.evaluate(() => { window.__forceProjectsRejectedScopes = ["active"]; });
  }
  await page.evaluate(() => { window.__lorelumTrackStaleWrites = true; window.__lorelumReleasePendingProjectRequests?.(); });
  await page.waitForTimeout(50);
  await expect.poll(() => page.evaluate(() => window.__lorelumSetterCalls)).toBe(0);
});
`;

async function run(): Promise<number> {
  const dashboard = await readFile(dashboardPath, "utf8");
  if (!dashboard.includes('from "react"')) throw new Error("Runtime probe requires src/Dashboard.tsx to import React from react");
  const instrumentedDashboard = dashboard.replace('from "react"', 'from "./__lorelum-react"');
  try {
    await Promise.all([writeFile(dashboardPath, instrumentedDashboard), writeFile(wrapperPath, wrapper), writeFile(testPath, probeTest)]);
    const child = Bun.spawn([process.execPath, "run", "test", "--", "tests/__lorelum-operation-ownership.probe.spec.ts"], { cwd: appRoot, stdout: "inherit", stderr: "inherit" });
    return await child.exited;
  } finally {
    await Promise.all([writeFile(dashboardPath, dashboard), rm(wrapperPath, { force: true }), rm(testPath, { force: true })]);
  }
}

process.exit(await run());
