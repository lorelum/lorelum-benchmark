export type ProfileResponse = { status: 200; body: { display_name: string } };
export type SaveProfileResponse =
  | { status: 200; body: { display_name: string } }
  | { status: 409; body: { code: "display_name_taken" } };

declare global {
  interface Window {
    __profileRequestCount?: number;
  }
}

export async function getProfile(): Promise<ProfileResponse> {
  await new Promise((resolve) => window.setTimeout(resolve, 120));
  return { status: 200, body: { display_name: "Ari" } };
}

export async function saveProfile(displayName: string): Promise<SaveProfileResponse> {
  window.__profileRequestCount = (window.__profileRequestCount ?? 0) + 1;
  await new Promise((resolve) => window.setTimeout(resolve, 250));
  if (displayName === "已使用") return { status: 409, body: { code: "display_name_taken" } };
  return { status: 200, body: { display_name: displayName } };
}
