import { useState } from "react";
import { login as authenticate } from "./api/session";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<Awaited<ReturnType<typeof authenticate>> | null>(null);
  const disabled = submitting || email.length === 0 && password.length === 0;
  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (submitting) { return; }
    setSubmitting(true);
    try { setNotice(await authenticate(email, password)); } finally { setSubmitting(false); }
  }
  return <main><section aria-labelledby="login-title"><h1 id="login-title">管理控制台</h1>
    <form aria-busy={submitting} onSubmit={handleSubmit}>
      <label>邮箱<input disabled={disabled} type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>密码<input disabled={disabled} type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <button disabled={disabled} type="submit">登录</button>
    </form>
    {notice ? (notice.ok ? <p role="status">登录成功</p> : <p role="alert">{notice.message}</p>) : null}
  </section></main>;
}
