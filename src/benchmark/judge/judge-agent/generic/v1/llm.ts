export type JudgeLlmEnv = {
  real: boolean;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
};

export function judgeLlmEnv(env: Record<string, string | undefined> = Bun.env): JudgeLlmEnv {
  return {
    real: env.LORELUM_JUDGE_REAL === "1",
    baseUrl: env.LORELUM_JUDGE_BASE_URL,
    apiKey: env.LORELUM_JUDGE_API_KEY,
    model: env.LORELUM_JUDGE_MODEL,
  };
}

export function requireJudgeLlmEnv(env: JudgeLlmEnv): { baseUrl: string; apiKey: string; model: string } {
  if (!env.real) throw new Error("real LLM judge requires LORELUM_JUDGE_REAL=1");
  if (!env.baseUrl || !env.apiKey || !env.model) {
    throw new Error("LORELUM_JUDGE_BASE_URL, LORELUM_JUDGE_API_KEY and LORELUM_JUDGE_MODEL are required when LORELUM_JUDGE_REAL=1");
  }
  return { baseUrl: env.baseUrl.replace(/\/+$/, ""), apiKey: env.apiKey, model: env.model };
}

export type JudgeCompletion = (system: string, user: string) => Promise<unknown>;

/** Lightweight OpenAI-compatible chat completions client (single call, no agent loop). */
export function httpJudgeCompletion(
  env: Record<string, string | undefined> = Bun.env,
  timeoutMs = 120_000,
): JudgeCompletion {
  const { baseUrl, apiKey, model } = requireJudgeLlmEnv(judgeLlmEnv(env));
  return async (system, user) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`judge LLM request failed: HTTP ${response.status} ${(await response.text().catch(() => "")).slice(0, 300)}`);
      }
      const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error("judge LLM returned no message content");
      return JSON.parse(content) as unknown;
    } finally {
      clearTimeout(timer);
    }
  };
}
