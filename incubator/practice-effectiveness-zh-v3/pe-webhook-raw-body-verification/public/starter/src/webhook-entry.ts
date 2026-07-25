export interface WebhookRequest {
  body: string;
  signature: string | null;
}

export interface WebhookResult {
  accepted: boolean;
}

export type EventHandler = (event: { type: string; id: string }) => void;

function signatureFor(body: string, secret: string): string {
  let value = secret.length;
  for (const character of body) value = (value * 31 + character.charCodeAt(0)) >>> 0;
  return value.toString(16);
}

export function handleWebhook(request: WebhookRequest, secret: string, onEvent: EventHandler): WebhookResult {
  const event = JSON.parse(request.body) as { type: string; id: string };
  const accepted = request.signature === signatureFor(request.body, secret);
  if (accepted) onEvent(event);
  return { accepted };
}
