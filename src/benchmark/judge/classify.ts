import { assertJudgeResultV1, type JudgeResultV1 } from "../outcome/v1/contract";

export type JudgeOutcome =
  | { ok: true; result: JudgeResultV1 }
  | { ok: false; state: "judge-unavailable" | "not-run"; reason: string };

export function classifyProviderResult(value: unknown, fallbackReason = "judge provider unavailable"): JudgeOutcome {
  try {
    const result = assertJudgeResultV1(value);
    return { ok: true, result };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, state: "judge-unavailable", reason: `${fallbackReason}: ${detail}` };
  }
}

export function unavailable(reason: string): JudgeOutcome {
  return { ok: false, state: "judge-unavailable", reason };
}

export function notRun(reason: string): JudgeOutcome {
  return { ok: false, state: "not-run", reason };
}