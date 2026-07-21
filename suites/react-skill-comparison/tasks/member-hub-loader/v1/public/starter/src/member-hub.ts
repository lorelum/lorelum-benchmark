export interface MemberProfile {
  id: string;
  displayName: string;
}

export interface Organisation {
  id: string;
  name: string;
}

export interface Project {
  id: string;
  name: string;
}

export interface PendingReview {
  id: string;
  projectId: string;
}

export interface ActivityRecord {
  id: string;
  projectId: string;
  action: string;
}

export interface MemberHubApi {
  getMemberProfile(memberId: string): Promise<MemberProfile>;
  getOrganisationForMember(memberId: string): Promise<Organisation>;
  getProjects(organisationId: string): Promise<Project[]>;
  getPendingReviews(organisationId: string): Promise<PendingReview[]>;
  getActivity(projectIds: string[]): Promise<ActivityRecord[]>;
}

export interface MemberHub {
  profile: MemberProfile;
  organisation: Organisation;
  projects: Project[];
  pendingReviews: PendingReview[];
  activity: ActivityRecord[] | null;
}

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
