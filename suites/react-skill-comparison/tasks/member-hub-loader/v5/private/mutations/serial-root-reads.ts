export async function loadMemberHub(api: any, input: any) {
  const id = input.memberId.trim();
  if (!id) return null;
  const profile = await api.getMemberProfile(id);
  const organisation = await api.getOrganisationForMember(id);
  const [projects, pendingReviews] = await Promise.all([
    api.getProjects(organisation.id),
    api.getPendingReviews(organisation.id)
  ]);
  return { profile, organisation, projects, pendingReviews };
}
