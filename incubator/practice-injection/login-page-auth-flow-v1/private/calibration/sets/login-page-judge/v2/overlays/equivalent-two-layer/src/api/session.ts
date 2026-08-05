export type LoginResult =
  | { ok: true; user: { id: string; display_name: string; role: string } }
  | { ok: false; message: string };

export async function login(email: string, password: string): Promise<LoginResult> {
  const response = await fetch("/api/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = (await response.json()) as { user?: { id: string; display_name: string; role: string }; message?: string };
  if (response.status === 200) {
    return { ok: true, user: body.user as { id: string; display_name: string; role: string } };
  }
  return { ok: false, message: body.message ?? "???????" };
}
