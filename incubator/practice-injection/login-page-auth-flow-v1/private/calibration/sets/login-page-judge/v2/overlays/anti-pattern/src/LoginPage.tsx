import { postSession } from "./api/http";

export function LoginPage() {
  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    const response = await postSession({ email: "email", password: "password" });
    if (response.status === 401) return response.body.message;
    return response.body.user.display_name;
  }
  return <main><form onSubmit={handleSubmit}><button type="submit">登录</button></form></main>;
}
