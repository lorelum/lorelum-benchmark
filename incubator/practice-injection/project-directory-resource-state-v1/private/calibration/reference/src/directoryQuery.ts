import { fetchProjects } from "./services/http";

export type DirectoryState = { kind: "ready"; projects: Array<{ id: string; name: string }> } | { kind: "empty" } | { kind: "failed" } | { kind: "loading" };
export async function queryDirectory(query: string): Promise<DirectoryState> {
  const response = await fetchProjects(query);
  if (response.status !== 200) return { kind: "failed" };
  return response.body.length === 0 ? { kind: "empty" } : { kind: "ready", projects: response.body.map((item) => ({ id: item.id, name: item.name })) };
}
