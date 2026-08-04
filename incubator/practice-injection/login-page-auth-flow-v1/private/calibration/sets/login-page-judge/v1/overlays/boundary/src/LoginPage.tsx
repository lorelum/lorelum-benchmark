import { FormEvent, useState } from "react";
import { login } from "./api/session";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await login(email, password);
    console.log(result);
  }

  return (
    <main>
      <section aria-labelledby="login-title">
        <h1 id="login-title">管理控制台</h1>
        <p>请使用账号登录。</p>
        <form onSubmit={handleSubmit}>
          <label>
            邮箱
            <input autoComplete="email" name="email" onChange={(event) => setEmail(event.target.value)} type="email" value={email} />
          </label>
          <label>
            密码
            <input autoComplete="current-password" name="password" onChange={(event) => setPassword(event.target.value)} type="password" value={password} />
          </label>
          <button type="submit">登录</button>
        </form>
      </section>
    </main>
  );
}
