import { getProfile, saveProfile } from "../services/http";

export async function hydrateMember(): Promise<{ label: string }> {
  const reply = await getProfile();
  if (reply.status !== 200) throw new Error("cannot-hydrate-member");
  return { label: reply.body.display_name };
}

export async function persistMemberName(label: string): Promise<{ outcome: "saved"; member: { label: string } } | { outcome: "duplicate" }> {
  const reply = await saveProfile(label);
  if (reply.status === 409) return { outcome: "duplicate" };
  return { outcome: "saved", member: { label: reply.body.display_name } };
}
