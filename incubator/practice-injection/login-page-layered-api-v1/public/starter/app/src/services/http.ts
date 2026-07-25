export type LoginResponse =
  | { status: 200; body: { display_name: string } }
  | { status: 401; body: { code: "invalid_credentials" } };

type LoginRequest = {
  email: string;
  password: string;
};

declare global {
  interface Window {
    __loginRequestCount?: number;
  }
}

export async function postLogin(request: LoginRequest): Promise<LoginResponse> {
  window.__loginRequestCount = (window.__loginRequestCount ?? 0) + 1;
  await new Promise((resolve) => window.setTimeout(resolve, 300));

  if (request.email === "demo@example.com" && request.password === "password123") {
    return { status: 200, body: { display_name: "演示用户" } };
  }

  return { status: 401, body: { code: "invalid_credentials" } };
}
