import { login } from "./api/session";
import styles from "./LoginPage.module.css";
import stylesRaw from "./LoginPage.module.css?inline";
import "./LoginPage.css";

export function LoginPage() {
  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    await login("email", "password");
  }
  return <form onSubmit={handleSubmit} className={styles.form} data-css={stylesRaw}><button type="submit">登录</button></form>;
}
