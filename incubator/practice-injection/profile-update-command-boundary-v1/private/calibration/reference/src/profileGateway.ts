import { getProfile, saveProfile } from "./services/http";

export type Profile = { displayName: string };
export type UpdateProfileResult = { kind: "saved"; profile: Profile } | { kind: "name-taken" };

export async function loadProfile(): Promise<Profile> {
  const response = await getProfile();
  if (response.status !== 200) throw new Error("profile-unavailable");
  return { displayName: response.body.display_name };
}

export async function updateProfile(displayName: string): Promise<UpdateProfileResult> {
  const response = await saveProfile(displayName);
  if (response.status === 409) return { kind: "name-taken" };
  return { kind: "saved", profile: { displayName: response.body.display_name } };
}
