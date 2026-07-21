import type { MemberHub, MemberHubApi } from "../reference/src/member-hub";

export async function loadMemberHub(
  api: MemberHubApi,
  input: { memberId: string; includeActivity: boolean },
): Promise<MemberHub | null> {
  const memberId = input.memberId.trim();
  if (!memberId) return null;

  const profile = await api.getMemberProfile(memberId);
  const organisation = await api.getOrganisationForMember(memberId);
  const projects = await api.getProjects(organisation.id);
  const pendingReviews = await api.getPendingReviews(organisation.id);
  const activity = input.includeActivity
    ? await api.getActivity(projects.map((project) => project.id))
    : null;

  return { profile, organisation, projects, pendingReviews, activity };
}
