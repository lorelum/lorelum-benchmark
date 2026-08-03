import { FormEvent, useState } from "react";
import { login, type LoginResult } from "./api/session";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<LoginResult | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setNotice(null);
    try {
      setNotice(await login(email, password));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main>
      <section aria-labelledby="login-title">
        <h1 id="login-title">管理控制台</h1>
        <p>请使用账号登录。</p>
        <form aria-busy={submitting} onSubmit={handleSubmit}>
          <label>
            邮箱
            <input autoComplete="email" disabled={submitting} name="email" onChange={(event) => setEmail(event.target.value)} type="email" value={email} />
          </label>
          <label>
            密码
            <input autoComplete="current-password" disabled={submitting} name="password" onChange={(event) => setPassword(event.target.value)} type="password" value={password} />
          </label>
          <button disabled={submitting} type="submit">{submitting ? "登录中..." : "登录"}</button>
        </form>
        {notice ? (notice.ok ? <p role="status">欢迎，{notice.user.display_name}</p> : <p role="alert">{notice.message}</p>) : null}
      </section>
    </main>
  );
}
