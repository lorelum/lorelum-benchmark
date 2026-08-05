import type { FormEvent } from "react";

export function LoginForm({ onSubmit }: { onSubmit: (event: FormEvent) => void }) {
  return <form onSubmit={onSubmit}><button type="submit">登录</button></form>;
}
