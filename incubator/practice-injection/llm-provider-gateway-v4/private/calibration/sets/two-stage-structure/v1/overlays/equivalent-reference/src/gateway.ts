import { chatWithFirst } from "./first-provider";
import { withRetry } from "./retry";
import { recordBilling } from "./ledger";

export async function chat(request: { tenant: string; message: string }, traceId = request.tenant): Promise<{ content: string }> {
  return withRetry(async () => {
    const result = await chatWithFirst([{ role: "user", content: request.message }]);
    await recordBilling({
      tenant: request.tenant,
      provider: "first",
      input: result.usage.input,
      output: result.usage.output,
      cost: result.usage.input * 0.01 + result.usage.output * 0.02,
      trace_id: traceId,
    });
    return { content: result.content };
  });
}
