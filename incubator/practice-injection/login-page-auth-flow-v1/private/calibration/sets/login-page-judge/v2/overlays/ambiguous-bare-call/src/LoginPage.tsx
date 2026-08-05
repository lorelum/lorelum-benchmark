import { login } from "./api/session";

export function LoginPage() {
  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    login("email", "password");
  }
  return <form onSubmit={handleSubmit}><button type="submit">??</button></form>;
}
