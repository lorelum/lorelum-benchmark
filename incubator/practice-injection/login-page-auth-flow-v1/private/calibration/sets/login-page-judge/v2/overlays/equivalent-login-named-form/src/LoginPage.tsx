import { login } from "./api/session";
import { LoginForm } from "./LoginForm";

export function LoginPage() {
  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    await login("email", "password");
  }
  return <LoginForm onSubmit={handleSubmit} />;
}
