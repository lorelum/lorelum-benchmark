import { cache } from "react";
export interface Account { id: string; name: string; }
export interface Permissions { canManage: boolean; }
export interface AccountApi { getAccount(id: string): Promise<Account | null>; getPermissions(id: string): Promise<Permissions>; }
export interface AccountSummary { account: Account; permissions: Permissions; }
export async function loadAccountSummary(api: AccountApi, input: { accountId: string }): Promise<AccountSummary | null> { const id = input.accountId.trim(); if (!id) return null; const account = await api.getAccount(id); if (!account) return null; const permissions = await api.getPermissions(id); return { account, permissions }; }
