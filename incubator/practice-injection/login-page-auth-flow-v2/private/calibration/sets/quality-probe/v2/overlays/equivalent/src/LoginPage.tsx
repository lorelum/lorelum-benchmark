import { useState } from "react";
import { authenticate } from "./api/auth";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof authenticate>> | null>(null);
  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    try { setResult(await authenticate(email, password)); } finally { setPending(false); }
  }
  return <main><form aria-busy={pending} onSubmit={handleSubmit}>
    <label>邮箱<input disabled={pending} type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
    <label>密码<input disabled={pending} type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
    <button disabled={pending} type="submit">登录</button>
  </form>
  {result ? (result.ok ? <p role="status">欢迎，{result.user?.display_name}</p> : <p role="alert">{result.message}</p>) : null}
  </main>;
}
