import { login } from "./api/session";

export function LoginPage() {
  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    await login("email", "password");
  }
  return <form onSubmit={handleSubmit}><button type="submit">登录</button></form>;
}
