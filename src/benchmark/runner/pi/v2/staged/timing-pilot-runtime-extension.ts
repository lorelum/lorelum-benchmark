import { readFileSync, writeFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type BudgetState = { turns: number; ready?: boolean; exhausted?: boolean };

function loadState(path: string): BudgetState {
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value) || !Number.isInteger((value as Record<string, unknown>).turns) || ((value as Record<string, unknown>).turns as number) < 0) {
      throw new Error("timing pilot turn budget state is invalid");
    }
    return value as BudgetState;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return { turns: 0 };
    throw error;
  }
}

function saveState(path: string, state: BudgetState): void {
  writeFileSync(path, `${JSON.stringify(state)}\n`, "utf8");
}

export default function timingPilotRuntimeExtension(pi: ExtensionAPI, env: Record<string, string | undefined> = process.env): void {
  const statePath = env.LORELUM_TIMING_PILOT_TURN_STATE;
  const maxTurnsText = env.LORELUM_TIMING_PILOT_MAX_TURNS;
  const maxTurns = Number(maxTurnsText);
  if (!statePath || !Number.isInteger(maxTurns) || maxTurns < 1) throw new Error("timing pilot turn budget configuration is missing or invalid");
  const state = loadState(statePath);
  state.ready = true;
  saveState(statePath, state);

  pi.on("turn_start", (_event, ctx) => {
    if (state.turns >= maxTurns) {
      state.exhausted = true;
      saveState(statePath, state);
      ctx.abort();
      return;
    }
    state.turns += 1;
    saveState(statePath, state);
  });

}
