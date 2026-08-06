export type ProjectResponse =
  | { status: 200; body: Array<{ id: string; name: string }> }
  | { status: 503; body: { code: "unavailable" } };

export async function fetchProjects(query: string): Promise<ProjectResponse> {
  const url = query ? `/api/projects?q=${encodeURIComponent(query)}` : "/api/projects";
  const response = await fetch(url, { method: "GET", headers: { accept: "application/json" } });
  const body = (await response.json()) as ProjectResponse["body"];
  if (response.status === 503) return { status: 503, body: body as { code: "unavailable" } };
  return { status: 200, body: body as Array<{ id: string; name: string }> };
}
