import { useState } from "react";
import { login } from "./api/session";

async function submitLogin(
  email: string,
  password: string,
  submitting: boolean,
  setSubmitting: (value: boolean) => void,
  setNotice: (notice: Awaited<ReturnType<typeof login>> | null) => void,
) {
  if (submitting) return;
  setSubmitting(true);
  try {
    setNotice(await login(email, password));
  } finally {
    setSubmitting(false);
  }
}

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<Awaited<ReturnType<typeof login>> | null>(null);
  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    await submitLogin(email, password, submitting, setSubmitting, setNotice);
  }
  async function handleSubmitAlt(event: SubmitEvent) {
    event.preventDefault();
    await submitLogin(email, password, submitting, setSubmitting, setNotice);
  }
  return <main><section aria-labelledby="login-title"><h1 id="login-title">管理控制台</h1>
    <form aria-busy={submitting} onSubmit={handleSubmit}>
      <label>邮箱<input disabled={submitting} type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>密码<input disabled={submitting} type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <button disabled={submitting} type="submit">登录</button>
    </form>
    <form aria-busy={submitting} onSubmit={handleSubmitAlt}>
      <button disabled={submitting} type="submit">重新提交</button>
    </form>
    {notice ? (notice.ok ? <p role="status">登录成功</p> : <p role="alert">{notice.message}</p>) : null}
  </section></main>;
}