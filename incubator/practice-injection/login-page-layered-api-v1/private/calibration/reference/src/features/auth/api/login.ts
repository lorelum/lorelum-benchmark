import { postLogin } from "../../../services/http";

type LoginInput = { email: string; password: string };
type LoginRequest = { email: string; password: string };
type LoginResult = { displayName: string };

export class AuthError extends Error {}

function toLoginRequest(input: LoginInput): LoginRequest {
  return { email: input.email.trim(), password: input.password };
}

function toLoginResult(response: { body: { display_name: string } }): LoginResult {
  return { displayName: response.body.display_name };
}

export async function login(input: LoginInput): Promise<LoginResult> {
  const response = await postLogin(toLoginRequest(input));
  if (response.status === 401) throw new AuthError("邮箱或密码错误");
  return toLoginResult(response);
}
