import { FormEvent, useState } from "react";
import { AuthError, login } from "./features/auth/api/login";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [welcome, setWelcome] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError("");
    setWelcome("");

    try {
      const result = await login({ email, password });
      setWelcome(`欢迎，${result.displayName}`);
    } catch (error) {
      setError(error instanceof AuthError ? "邮箱或密码错误" : "登录失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main>
      <section aria-labelledby="login-title">
        <h1 id="login-title">演示登录</h1>
        <form aria-busy={submitting} onSubmit={handleSubmit}>
          <label>
            邮箱
            <input
              autoComplete="email"
              disabled={submitting}
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              value={email}
            />
          </label>
          <label>
            密码
            <input
              autoComplete="current-password"
              disabled={submitting}
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
          </label>
          <button disabled={submitting} type="submit">{submitting ? "登录中..." : "登录"}</button>
        </form>
        {error ? <p role="alert">{error}</p> : null}
        {welcome ? <p role="status">{welcome}</p> : null}
      </section>
    </main>
  );
}
