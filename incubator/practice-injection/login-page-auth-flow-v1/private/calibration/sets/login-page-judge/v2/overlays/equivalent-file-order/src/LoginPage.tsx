import { login } from "./api/session";
import { Form } from "./components/Form";

export function LoginPage() {
  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    await login("email", "password");
  }
  return <Form onSubmit={handleSubmit} />;
}
