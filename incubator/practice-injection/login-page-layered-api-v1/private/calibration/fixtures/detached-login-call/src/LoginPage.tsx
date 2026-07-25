import { FormEvent, useEffect, useState } from "react";
import { login } from "./features/auth/api/login";

export function LoginPage() {
  const [message, setMessage] = useState("");

  useEffect(() => {
    void login({ email: "demo@example.com", password: "password123" });
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("欢迎，演示用户");
  }

  return <form onSubmit={handleSubmit}><button type="submit">登录</button><p>{message}</p></form>;
}
