import { FormEvent, useState } from "react";
import { authenticate } from "./authGateway";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [welcome, setWelcome] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await authenticate({ email, password });
    if (result.kind === "failure") setError(result.message);
    else setWelcome(`欢迎，${result.accountName}`);
  }

  return <form onSubmit={submit}>{welcome || error}</form>;
}
