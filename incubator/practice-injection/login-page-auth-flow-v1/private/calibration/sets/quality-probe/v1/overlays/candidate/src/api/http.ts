export type SessionResponse =
  | { status: 200; body: { user: { id: string; display_name: string; role: string } } }
  | { status: 401; body: { code: "invalid_credentials"; message: string } };

type SessionRequest = {
  email: string;
  password: string;
};

declare global {
  interface Window {
    __sessionRequestCount?: number;
  }
}

export async function postSession(request: SessionRequest): Promise<SessionResponse> {
  window.__sessionRequestCount = (window.__sessionRequestCount ?? 0) + 1;
  await new Promise((resolve) => window.setTimeout(resolve, 300));

  if (request.email === "admin@example.com" && request.password === "admin123") {
    return { status: 200, body: { user: { id: "u-1", display_name: "系统管理员", role: "admin" } } };
  }

  return { status: 401, body: { code: "invalid_credentials", message: "邮箱或密码错误" } };
}