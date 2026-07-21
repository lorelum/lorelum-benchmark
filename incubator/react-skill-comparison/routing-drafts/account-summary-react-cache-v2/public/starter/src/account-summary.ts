export interface Repository { account(id: string): Promise<{ id: string } | null>; permissions(id: string): Promise<string[]>; }
export async function loadAccountSummary(repository: Repository, accountId: string): Promise<unknown> { throw new Error("TODO"); }
