export interface MemberProfile { id: string; displayName: string; }
export interface Organisation { id: string; name: string; }
export interface Project { id: string; name: string; }
export interface PendingReview { id: string; projectId: string; }
export interface MemberHubApi {
  getMemberProfile(memberId: string): Promise<MemberProfile>;
  getOrganisationForMember(memberId: string): Promise<Organisation>;
  getProjects(organisationId: string): Promise<Project[]>;
  getPendingReviews(organisationId: string): Promise<PendingReview[]>;
}
export interface MemberHub { profile: MemberProfile; organisation: Organisation; projects: Project[]; pendingReviews: PendingReview[]; }
export async function loadMemberHub(api: MemberHubApi, input: { memberId: string }): Promise<MemberHub | null> {
  const memberId = input.memberId.trim();
  if (!memberId) return null;
  const profilePromise = api.getMemberProfile(memberId);
  const organisationPromise = api.getOrganisationForMember(memberId);
  const projectsPromise = organisationPromise.then((organisation) => api.getProjects(organisation.id));
  const pendingReviewsPromise = organisationPromise.then((organisation) => api.getPendingReviews(organisation.id));
  const [profile, organisation, projects, pendingReviews] = await Promise.all([profilePromise, organisationPromise, projectsPromise, pendingReviewsPromise]);
  return { profile, organisation, projects, pendingReviews };
}
