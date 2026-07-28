import { getProfile, saveProfile } from "./services/http";

// This wrapper deliberately leaks transport responses to the component.
export const loadRawProfile = () => getProfile();
export const submitRawProfile = (displayName: string) => saveProfile(displayName);
