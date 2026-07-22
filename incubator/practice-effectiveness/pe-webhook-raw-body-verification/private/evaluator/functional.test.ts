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
const authorizedBody = '{"type":"notice.created","id":"evt-100"}';
const authorizedSignature = "5b67b005";

test("functional: fixed authorized request is accepted and handled", () => {
  const received: { type: string; id: string }[] = [];
  const result = handleWebhook({ body: authorizedBody, signature: authorizedSignature }, testSecret, (event) => received.push(event));

  expect(result.accepted).toBe(true);
  expect(received).toEqual([{ type: "notice.created", id: "evt-100" }]);
});

test("functional: fixed unauthorized request is rejected", () => {
  const result = handleWebhook({ body: authorizedBody, signature: "wrong" }, testSecret, () => undefined);

  expect(result.accepted).toBe(false);
});
