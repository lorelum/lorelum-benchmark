import { DirectoryClient } from "@/components/team/directory-client";
import { DeterministicRepository, viewerFor } from "@/lib/repository";

export default async function TeamPage() {
  const sourceMembers = await new DeterministicRepository().getMembers(viewerFor("atlas"));
  const members = sourceMembers.map(({ id, name, role }) => ({ id, name, role }));
  return <main><h1>Team directory</h1><DirectoryClient members={members} memberIds={members.map((member) => member.id)} /></main>;
}
