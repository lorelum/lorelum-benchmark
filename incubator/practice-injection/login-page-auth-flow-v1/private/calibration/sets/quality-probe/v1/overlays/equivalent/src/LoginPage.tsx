import { FormEvent, useState } from "react";
import { signIn, type SignInOutcome } from "./features/auth/authApi";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<SignInOutcome | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setOutcome(null);
    try {
      setOutcome(await signIn(email, password));
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
        {outcome ? (outcome.ok ? <p role="status">欢迎，{outcome.user.display_name}</p> : <p role="alert">{outcome.message}</p>) : null}
      </section>
    </main>
  );
}
