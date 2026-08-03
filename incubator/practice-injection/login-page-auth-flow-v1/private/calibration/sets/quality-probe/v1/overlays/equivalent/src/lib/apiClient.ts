export type SessionReply =
  | { status: 200; body: { user: { id: string; display_name: string; role: string } } }
  | { status: 401; body: { code: "invalid_credentials"; message: string } };

type SessionPayload = { email: string; password: string };

export async function requestSession(payload: SessionPayload): Promise<SessionReply> {
  const response = await fetch("/api/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await response.json()) as SessionReply["body"];
  return { status: response.status as SessionReply["status"], body };
}
