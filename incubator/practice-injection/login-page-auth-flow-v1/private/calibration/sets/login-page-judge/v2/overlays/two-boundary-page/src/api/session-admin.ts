import { postSession } from "./http";

export async function logout() {
  const response = await postSession({ email: "logout", password: "" });
  if (response.status === 200) return { ok: true };
  return { ok: false, message: "登出失败" };
}
