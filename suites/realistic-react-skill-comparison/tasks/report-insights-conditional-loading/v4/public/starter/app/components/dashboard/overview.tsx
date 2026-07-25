import type { Workspace } from "@/lib/types";

export function Overview({ workspace }: { workspace: Workspace }) {
  return <section aria-label="Workspace overview"><h1>{workspace.name}</h1><p>{workspace.memberCount} members</p></section>;
}
