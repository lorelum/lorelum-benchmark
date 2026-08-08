export type ProfileResponse = { status: 200; body: { display_name: string } };
export type SaveProfileResponse =
  | { status: 200; body: { display_name: string } }
  | { status: 409; body: { code: "display_name_taken" } };

export async function getProfile(): Promise<ProfileResponse> {
  const response = await fetch("/api/profile", { method: "GET", headers: { accept: "application/json" } });
  const body = (await response.json()) as ProfileResponse["body"];
  return { status: 200, body };
}

export async function saveProfile(displayName: string): Promise<SaveProfileResponse> {
  const response = await fetch("/api/profile", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ display_name: displayName }),
  });
  const body = (await response.json()) as SaveProfileResponse["body"];
  if (response.status === 409) return { status: 409, body: body as { code: "display_name_taken" } };
  return { status: 200, body: body as { display_name: string } };
}
