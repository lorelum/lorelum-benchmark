import { cache } from "react";
export interface Account { id: string; name: string; }
export interface Permissions { canManage: boolean; }
export interface AccountApi { getAccount(id: string): Promise<Account | null>; getPermissions(id: string): Promise<Permissions>; }
export interface AccountSummary { account: Account; permissions: Permissions; }
const read = cache(async (api: AccountApi, accountId: string): Promise<AccountSummary | null> => { const account = await api.getAccount(accountId); if (!account) return null; return { account, permissions: await api.getPermissions(accountId) }; });
export function loadAccountSummary(api: AccountApi, input: { accountId: string }): Promise<AccountSummary | null> { const id = input.accountId.trim(); return id ? read(api, id) : Promise.resolve(null); }
