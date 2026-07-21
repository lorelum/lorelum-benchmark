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
  const profile = await api.getMemberProfile(memberId);
  const organisation = await api.getOrganisationForMember(memberId);
  const projects = await api.getProjects(organisation.id);
  const pendingReviews = await api.getPendingReviews(organisation.id);
  return { profile, organisation, projects, pendingReviews };
}
