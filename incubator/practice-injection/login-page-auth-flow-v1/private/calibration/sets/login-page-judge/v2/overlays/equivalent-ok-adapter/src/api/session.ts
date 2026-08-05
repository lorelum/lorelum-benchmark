import { postSession, type SessionResponse } from "./http";

export type LoginResult =
  | { ok: true; user: { id: string; display_name: string; role: string } }
  | { ok: false; message: string };

export async function login(email: string, password: string): Promise<LoginResult> {
  const response: SessionResponse = await postSession({ email, password });
  if (response.ok) {
    return { ok: true, user: response.body.user };
  }
  return { ok: false, message: response.body.message };
}
