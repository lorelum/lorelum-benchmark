import type { MemberHub, MemberHubApi } from "../reference/src/member-hub";

export async function loadMemberHub(
  api: MemberHubApi,
  input: { memberId: string; includeActivity: boolean },
): Promise<MemberHub | null> {
  const memberId = input.memberId.trim();
  if (!memberId) return null;

  try {
    const profilePromise = api.getMemberProfile(memberId);
    const organisationPromise = api.getOrganisationForMember(memberId);
    const projectsPromise = organisationPromise.then((organisation) => api.getProjects(organisation.id));
    const pendingReviewsPromise = organisationPromise.then((organisation) => api.getPendingReviews(organisation.id));
    const activityPromise = input.includeActivity
      ? projectsPromise.then((projects) => api.getActivity(projects.map((project) => project.id)))
      : Promise.resolve(null);
    const [profile, organisation, projects, pendingReviews, activity] = await Promise.all([
      profilePromise,
      organisationPromise,
      projectsPromise,
      pendingReviewsPromise,
      activityPromise,
    ]);
    return { profile, organisation, projects, pendingReviews, activity };
  } catch {
    throw new Error("Unable to load member hub");
  }
}
