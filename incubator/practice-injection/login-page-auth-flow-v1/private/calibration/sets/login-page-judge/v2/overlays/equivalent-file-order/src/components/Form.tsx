import type { FormEvent } from "react";

export function Form({ onSubmit }: { onSubmit: (event: FormEvent) => void }) {
  return <form onSubmit={onSubmit}><button type="submit">??</button></form>;
}
