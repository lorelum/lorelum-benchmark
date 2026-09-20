import type { JudgeCompletionWithUsage, JudgeUsage } from "./types";

export type AsyncReportJudgeEnv = {
  real: boolean;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  calibrationStatus: "qualified" | "diagnostic" | "not-run";
};

export function asyncReportJudgeEnv(env: Record<string, string | undefined> = Bun.env): AsyncReportJudgeEnv {
  const calibrationStatus = env.LORELUM_JUDGE_CALIBRATION_STATUS === "qualified"
    ? "qualified"
    : env.LORELUM_JUDGE_CALIBRATION_STATUS === "not-run" ? "not-run" : "diagnostic";
  return { real: env.LORELUM_JUDGE_REAL === "1", baseUrl: env.LORELUM_JUDGE_BASE_URL, apiKey: env.LORELUM_JUDGE_API_KEY, model: env.LORELUM_JUDGE_MODEL, calibrationStatus };
}

export function requireAsyncReportJudgeConfig(env: AsyncReportJudgeEnv): { baseUrl: string; apiKey: string; model: string } {
  if (!env.real) throw new Error("judge-agent/async-report-replan/v1 requires LORELUM_JUDGE_REAL=1");
  if (!env.baseUrl || !env.apiKey || !env.model) throw new Error("LORELUM_JUDGE_BASE_URL, LORELUM_JUDGE_API_KEY and LORELUM_JUDGE_MODEL are required for async-report replan Judge");
  return { baseUrl: env.baseUrl.replace(/\/+$/, ""), apiKey: env.apiKey, model: env.model };
}

function usageFromResponse(value: unknown): Partial<JudgeUsage> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const usage = value as Record<string, unknown>;
  const input = typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : typeof usage.input_tokens === "number" ? usage.input_tokens : undefined;
  const output = typeof usage.completion_tokens === "number" ? usage.completion_tokens : typeof usage.output_tokens === "number" ? usage.output_tokens : undefined;
  const total = typeof usage.total_tokens === "number" ? usage.total_tokens : input !== undefined && output !== undefined ? input + output : undefined;
  const cost = typeof usage.cost_usd === "number" ? usage.cost_usd : typeof usage.cost === "number" ? usage.cost : undefined;
  if (input === undefined && output === undefined && total === undefined && cost === undefined) return undefined;
  return { input_tokens: input, output_tokens: output, total_tokens: total, cost_usd: cost };
}

export function httpAsyncReportJudgeCompletion(
  env: Record<string, string | undefined> = Bun.env,
  timeoutMs = Number(env.LORELUM_JUDGE_TIMEOUT_MS) || 300_000,
): JudgeCompletionWithUsage {
  const resolved = requireAsyncReportJudgeConfig(asyncReportJudgeEnv(env));
  return async (system, user) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${resolved.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${resolved.apiKey}` },
        body: JSON.stringify({
          model: resolved.model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`async-report Judge request failed: HTTP ${response.status}`);
      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: unknown };
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error("async-report Judge returned no structured content");
      return { output: JSON.parse(content) as unknown, usage: usageFromResponse(data.usage) };
    } finally {
      clearTimeout(timer);
    }
  };
}

