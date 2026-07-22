import { expect, test } from "bun:test";

type WebhookRequest = { body: string; signature: string | null };
type WebhookResult = { accepted: boolean };
type EventHandler = (event: { type: string; id: string }) => void;
type WebhookModule = { handleWebhook(request: WebhookRequest, secret: string, onEvent: EventHandler): WebhookResult };

const candidatePath = Bun.env.CANDIDATE_PATH
  ?? "incubator/practice-effectiveness/pe-webhook-raw-body-verification/public/starter/src/webhook-entry.ts";
const candidateUrl = `${Bun.pathToFileURL(candidatePath).href}?run=${Date.now()}`;
const { handleWebhook } = (await import(candidateUrl)) as WebhookModule;
const testSecret = "candidate-test-secret";

test("profile adherence: malformed raw input is rejected before parsing", () => {
  const received: { type: string; id: string }[] = [];
  const originalParse = JSON.parse;
  let parseCalls = 0;
  JSON.parse = ((text: string, reviver?: Parameters<typeof JSON.parse>[1]) => {
    parseCalls += 1;
    return originalParse(text, reviver);
  }) as typeof JSON.parse;

  const result = (() => {
    try {
      return handleWebhook({ body: "{", signature: "wrong" }, testSecret, (event) => received.push(event));
    } finally {
      JSON.parse = originalParse;
    }
  })();

  expect(result.accepted).toBe(false);
  expect(parseCalls).toBe(0);
  expect(received).toEqual([]);
});

test("profile adherence: missing or wrong authentication never reaches the handler", () => {
  const received: { type: string; id: string }[] = [];
  const request = { body: '{"type":"notice.created","id":"evt-100"}' };

  expect(handleWebhook({ ...request, signature: null }, testSecret, (event) => received.push(event)).accepted).toBe(false);
  expect(handleWebhook({ ...request, signature: "wrong" }, testSecret, (event) => received.push(event)).accepted).toBe(false);
  expect(received).toEqual([]);
});
