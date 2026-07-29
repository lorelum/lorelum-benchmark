import { fetchProjects } from "./http";

export type Catalog = { state: "ready"; items: Array<{ key: string; label: string }> } | { state: "empty" } | { state: "failed" } | { state: "loading" };

export async function loadCatalog(term: string): Promise<Catalog> {
  const reply = await fetchProjects(term);
  if (reply.status !== 200) return { state: "failed" };
  return reply.body.length ? { state: "ready", items: reply.body.map((entry) => ({ key: entry.id, label: entry.name })) } : { state: "empty" };
}
