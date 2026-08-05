import { login } from "./api/session";
import { track } from "./analytics";

export function LoginPage() {
  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    await login("email", "password");
  }
  return <form onSubmit={handleSubmit}><button type="submit">??</button></form>;
}
