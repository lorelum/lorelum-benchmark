import { afterEach, expect, test } from "bun:test";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import timingPilotRuntimeExtension from "./timing-pilot-runtime-extension";
import { workspaceRoot } from "../../../../fs";

type Hook = (event: any, context: { abort(): void }) => void;
const temporaryRoots: string[] = [];

afterEach(async () => Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

async function statePath(): Promise<string> {
  const path = join(workspaceRoot, ".run-workspaces", `timing-pilot-runtime-extension-${crypto.randomUUID()}`);
  temporaryRoots.push(path);
  await mkdir(path, { recursive: true });
  return join(path, "turn-budget.json");
}

function mockExtensionApi() {
  const hooks = new Map<string, Hook>();
  const api = { on: (name: string, handler: Hook) => { hooks.set(name, handler); } } as unknown as ExtensionAPI;
  return { api, hooks };
}

test("runtime extension enforces the shared per-attempt turn budget before a 129th turn", async () => {
  const file = await statePath();
  const { api, hooks } = mockExtensionApi();
  timingPilotRuntimeExtension(api, { LORELUM_TIMING_PILOT_TURN_STATE: file, LORELUM_TIMING_PILOT_MAX_TURNS: "128" });
  let aborted = 0;
  const start = hooks.get("turn_start");
  expect(start).toBeDefined();
  for (let index = 0; index < 128; index += 1) start?.({}, { abort: () => { aborted += 1; } });
  start?.({}, { abort: () => { aborted += 1; } });
  const state = JSON.parse(await readFile(file, "utf8")) as { turns: number; exhausted?: boolean };
  expect(state).toEqual({ turns: 128, ready: true, exhausted: true });
  expect(aborted).toBe(1);
});

test("runtime extension fails closed when its turn cap is absent", () => {
  const { api } = mockExtensionApi();
  expect(() => timingPilotRuntimeExtension(api, {})).toThrow("configuration is missing or invalid");
});
