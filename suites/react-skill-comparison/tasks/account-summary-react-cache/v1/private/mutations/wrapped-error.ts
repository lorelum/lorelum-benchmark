import { cache } from "react";
const read = cache(async (api: any, id: string) => { try { const account = await api.getAccount(id); return account ? { account, permissions: await api.getPermissions(id) } : null; } catch (error) { throw new Error(String(error)); } });
export function loadAccountSummary(api: any, input: { accountId: string }) { const id = input.accountId.trim(); return id ? read(api, id) : Promise.resolve(null); }
