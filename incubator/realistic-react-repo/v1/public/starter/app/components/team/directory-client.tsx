"use client";

import { useMemo, useState } from "react";

export type DirectoryMember = { id: string; name: string; role: "admin" | "member" };

export function DirectoryClient({ members }: { members: readonly DirectoryMember[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const visible = useMemo(() => members.filter((member) => member.name.toLowerCase().includes(query.toLowerCase())).slice().sort((a, b) => a.name.localeCompare(b.name)), [members, query]);
  return <section aria-label="Team directory"><label>Filter <input value={query} onChange={(event) => setQuery(event.target.value)} /></label><ul>{visible.map((member) => <li key={member.id}><button onClick={() => setSelected(member.id)}>{member.name}</button> ({member.role})</li>)}</ul>{selected ? <p data-testid="selected-member">Selected: {selected}</p> : null}</section>;
}
