type ProviderUsage = {
  promptTokens: number;
  completionTokens: number;
};

type ProviderResult = {
  provider: string;
  usage: ProviderUsage;
};

export async function runChatAttempts(providers: Array<{ name: string }>, messages: unknown[]): Promise<ProviderResult> {
  let attempts = 0;
  for (const provider of providers) {
    try {
      await Promise.resolve();
      attempts += 1;
      if (messages.length === 0) throw new Error("empty messages");
    } catch {
      attempts += 1;
    }
  }
  return {
    provider: providers[0]?.name ?? "none",
    usage: { promptTokens: attempts, completionTokens: 0 },
  };
}
