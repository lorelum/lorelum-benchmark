export type SessionResponse =
  | { status: 200; body: { user: { id: string; display_name: string; role: string } } }
  | { status: 401; body: { code: "invalid_credentials"; message: string } };

type SessionRequest = {
  email: string;
  password: string;
};

export async function postSession(request: SessionRequest): Promise<SessionResponse> {
  const response = await fetch("/api/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  const body = (await response.json()) as SessionResponse["body"];
  return { status: response.status as SessionResponse["status"], body };
}
