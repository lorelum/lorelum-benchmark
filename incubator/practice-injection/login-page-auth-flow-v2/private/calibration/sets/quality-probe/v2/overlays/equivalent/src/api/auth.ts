import { postSession } from "./http";

export type AuthResult = { ok: boolean; user?: { display_name: string }; message?: string };

export async function authenticate(email: string, password: string): Promise<AuthResult> {
  const response = await postSession({ email, password });
  if (response.status === 200) {
    return { ok: true, user: response.body.user };
  }
  return { ok: false, message: response.body.message };
}
