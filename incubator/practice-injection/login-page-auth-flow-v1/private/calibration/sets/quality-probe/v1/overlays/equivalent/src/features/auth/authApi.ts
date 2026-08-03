import { requestSession, type SessionReply } from "../../lib/apiClient";

export type SignInOutcome =
  | { ok: true; user: { id: string; display_name: string; role: string } }
  | { ok: false; message: string };

export async function signIn(email: string, password: string): Promise<SignInOutcome> {
  const reply: SessionReply = await requestSession({ email, password });
  if (reply.status === 200) {
    return { ok: true, user: reply.body.user };
  }
  return { ok: false, message: reply.body.message };
}
