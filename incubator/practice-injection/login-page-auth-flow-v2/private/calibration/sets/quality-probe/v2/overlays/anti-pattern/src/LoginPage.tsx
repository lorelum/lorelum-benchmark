import { useState } from "react";
import { postSession } from "./api/http";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);
  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const response = await postSession({ email, password });
      if (response.status === 401) setNotice({ ok: false, message: response.body.message });
      else setNotice({ ok: true, message: "欢迎，" + response.body.user.display_name });
    } finally {
      setSubmitting(false);
    }
  }
  return <main><form aria-busy={submitting} onSubmit={handleSubmit}>
    <label>邮箱<input disabled={submitting} type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
    <label>密码<input disabled={submitting} type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
    <button disabled={submitting} type="submit">登录</button>
  </form>
  {notice ? (notice.ok ? <p role="status">{notice.message}</p> : <p role="alert">{notice.message}</p>) : null}
  </main>;
}
