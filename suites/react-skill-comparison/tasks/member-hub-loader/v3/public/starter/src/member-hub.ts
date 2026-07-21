export interface MemberProfile { id: string; displayName: string; }
export interface Organisation { id: string; name: string; }
export interface Project { id: string; name: string; }
export interface PendingReview { id: string; projectId: string; }
export interface MemberHubApi { getMemberProfile(memberId: string): Promise<MemberProfile>; getOrganisationForMember(memberId: string): Promise<Organisation>; getProjects(organisationId: string): Promise<Project[]>; getPendingReviews(organisationId: string): Promise<PendingReview[]>; }
export interface MemberHub { profile: MemberProfile; organisation: Organisation; projects: Project[]; pendingReviews: PendingReview[]; }
export function loadMemberHub(_api: MemberHubApi, _input: { memberId: string }): Promise<MemberHub | null> { throw new Error("TODO"); }
