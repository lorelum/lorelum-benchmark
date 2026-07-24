import { DirectoryClient } from "@/components/team/directory-client";
import { DeterministicRepository, viewerFor } from "@/lib/repository";

// This control preserves every public interaction while carrying both excess
// representations in the initial server-to-client payload.
export default async function TeamPage() {
  const records = await new DeterministicRepository().getMembers(viewerFor("atlas"));
  const renderedMembers = records.map((member) => ({ ...member }));
  const memberIds = renderedMembers.map(({ id }) => id);
  return <main><h1>Team directory</h1><DirectoryClient members={renderedMembers} memberIds={memberIds} /></main>;
}
