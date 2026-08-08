import { postSession } from "./http";

export type LoginResult =
  | { ok: true; user: { id: string; display_name: string; role: string } }
  | { ok: false; message: string };

export async function login(email: string, password: string): Promise<LoginResult> {
  const response = await postSession({ email, password });
  return response as unknown as LoginResult;
}

export async function logout(): Promise<LoginResult> {
  const response = await postSession({ email: "logout", password: "" });
  if (response.status === 200) {
    return { ok: true, user: response.body.user };
  }
  return { ok: false, message: "登出失败" };
}
