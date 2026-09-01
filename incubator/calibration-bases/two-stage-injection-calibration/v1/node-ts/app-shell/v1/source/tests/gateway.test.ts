import { chat } from "../src/gateway";
import { afterEach, describe, expect, mock, test } from "bun:test";

const fetchMock = mock(async () => new Response(JSON.stringify({ content: "ok", usage: { input_tokens: 2, output_tokens: 3 } }), { status: 200 }));
globalThis.fetch = fetchMock as typeof fetch;
afterEach(() => fetchMock.mockClear());

describe("stage 1 gateway", () => {
  test("returns chat content", async () => {
    const result = await chat({ tenant: "acme", message: "hello" });
    expect(result.content).toBe("ok");
  });

  test("retries a transient failure", async () => {
    fetchMock.mockImplementationOnce(async () => new Response("temporary", { status: 503 }));
    const result = await chat({ tenant: "acme", message: "hello" });
    expect(result.content).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
