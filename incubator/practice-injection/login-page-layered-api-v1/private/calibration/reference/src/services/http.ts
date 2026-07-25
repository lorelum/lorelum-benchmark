export async function postLogin(input: { email: string; password: string }): Promise<{ status: 200; body: { display_name: string } } | { status: 401; body: { code: string } }> {
  return input.email === "demo@example.com"
    ? { status: 200, body: { display_name: "演示用户" } }
    : { status: 401, body: { code: "invalid_credentials" } };
}
