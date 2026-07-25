import { FormEvent, useState } from "react";
import { AuthError, login } from "./features/auth/api/login";

export function LoginPage() {
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const result = await login({ email: "demo@example.com", password: "password123" });
      setMessage(`欢迎，${result.displayName}`);
    } catch (error) {
      setMessage(error instanceof AuthError ? "邮箱或密码错误" : "登录失败");
    }
  }

  return <form onSubmit={handleSubmit}><button type="submit">登录</button><p>{message}</p></form>;
}
