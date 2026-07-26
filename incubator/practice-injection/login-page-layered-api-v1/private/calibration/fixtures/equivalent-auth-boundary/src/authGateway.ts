import { postLogin } from "./services/http";

export type AuthenticationResult =
  | { kind: "success"; accountName: string }
  | { kind: "failure"; message: string };

export async function authenticate(input: { email: string; password: string }): Promise<AuthenticationResult> {
  const response = await postLogin({ email: input.email, password: input.password });
  if (response.status === 200) return { kind: "success", accountName: response.body.display_name };
  return { kind: "failure", message: "邮箱或密码错误" };
}
