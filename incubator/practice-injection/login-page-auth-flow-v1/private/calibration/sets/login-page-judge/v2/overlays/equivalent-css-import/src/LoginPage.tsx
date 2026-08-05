import { login } from "./api/session";
import styles from "./LoginPage.module.css";
import "./LoginPage.css";

export function LoginPage() {
  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    await login("email", "password");
  }
  return <form onSubmit={handleSubmit} className={styles.form}><button type="submit">??</button></form>;
}
