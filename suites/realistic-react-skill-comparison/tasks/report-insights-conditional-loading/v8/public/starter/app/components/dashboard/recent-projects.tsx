import type { Project } from "@/lib/types";

export function RecentProjects({ projects }: { projects: readonly Project[] }) {
  return <section aria-label="Recent projects"><h2>Recent projects</h2><ul>{projects.map((project) => <li key={project.id}>{project.name}</li>)}</ul></section>;
}
