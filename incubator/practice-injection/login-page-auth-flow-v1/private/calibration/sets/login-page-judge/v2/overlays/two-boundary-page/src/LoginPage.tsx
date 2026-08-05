import { login } from "./api/session";
import { logout } from "./api/session-admin";

export function LoginPage() {
  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    await login("email", "password");
  }
  async function handleLogout(event: SubmitEvent) {
    event.preventDefault();
    await logout();
  }
  return <div>
    <form onSubmit={handleSubmit}><button type="submit">登录</button></form>
    <form onSubmit={handleLogout}><button type="submit">登出</button></form>
  </div>;
}
