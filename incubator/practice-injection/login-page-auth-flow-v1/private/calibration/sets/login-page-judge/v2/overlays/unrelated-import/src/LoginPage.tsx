import { useState } from "react";
import { login } from "./api/session";
import { irrelevantValue } from "./unrelated";

export function LoginPage() {
  const [submitting, setSubmitting] = useState(false);
  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try { await login(irrelevantValue, irrelevantValue); } finally { setSubmitting(false); }
  }
  return <form onSubmit={handleSubmit}><button disabled={submitting} type="submit">登录</button></form>;
}
