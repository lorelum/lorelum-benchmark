export interface Repository { profile(id: string): Promise<unknown>; organisation(id: string): Promise<{ id: string }>; projects(organisationId: string): Promise<unknown[]>; reviews(organisationId: string): Promise<unknown[]>; }
export async function loadMemberWorkspace(repository: Repository, input: { memberId: string }): Promise<unknown> { throw new Error("TODO"); }
