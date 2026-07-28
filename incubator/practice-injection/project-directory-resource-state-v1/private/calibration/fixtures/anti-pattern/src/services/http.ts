export type ProjectResponse = { status: 200; body: Array<{ id: string; name: string }> } | { status: 503; body: { code: "unavailable" } };
let outageAttempts = 0;

declare global {
  interface Window {
    __projectRequestCount?: number;
  }
}

export async function fetchProjects(query: string): Promise<ProjectResponse> {
  window.__projectRequestCount = (window.__projectRequestCount ?? 0) + 1;
  await new Promise((resolve) => window.setTimeout(resolve, 180));
  if (query === "outage" && outageAttempts++ === 0) return { status: 503, body: { code: "unavailable" } };
  const projects = [{ id: "orbit", name: "Orbit" }, { id: "zen", name: "Zen" }];
  return { status: 200, body: query === "outage" ? projects : projects.filter((project) => project.name.toLowerCase().includes(query.toLowerCase())) };
}
