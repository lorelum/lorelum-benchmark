export async function postLogin(input: { email: string; password: string }): Promise<{ status: number; body: { display_name: string } }> {
  return input.email === "demo@example.com" && input.password === "password123"
    ? { status: 200, body: { display_name: "演示用户" } }
    : { status: 401, body: { display_name: "" } };
}
