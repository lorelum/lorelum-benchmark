import { DirectoryClient } from "@/components/team/directory-client";
import { DeterministicRepository, viewerFor } from "@/lib/repository";

export default async function TeamPage() {
  const members = await new DeterministicRepository().getMembers(viewerFor("atlas"));
  return <main><h1>Team directory</h1><DirectoryClient members={members} /></main>;
}
