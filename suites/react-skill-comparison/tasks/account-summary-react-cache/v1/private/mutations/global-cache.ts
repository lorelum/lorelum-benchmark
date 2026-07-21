import { cache } from "react";
const values = new Map<string, Promise<any>>();
export function loadAccountSummary(api: any, input: { accountId: string }) { const id = input.accountId.trim(); if (!id) return Promise.resolve(null); if (!values.has(id)) values.set(id, (async () => { const account = await api.getAccount(id); return account ? { account, permissions: await api.getPermissions(id) } : null; })()); return values.get(id)!; }
