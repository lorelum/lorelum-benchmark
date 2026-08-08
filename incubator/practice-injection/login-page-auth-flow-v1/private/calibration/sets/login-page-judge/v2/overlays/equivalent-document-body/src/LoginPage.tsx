import { login } from "./api/session";

export function LoginPage() {
  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    document.body.classList.add("is-submitting");
    try {
      await login("email", "password");
    } finally {
      document.body.classList.remove("is-submitting");
    }
  }
  return <form onSubmit={handleSubmit}><button type="submit">??</button></form>;
}
