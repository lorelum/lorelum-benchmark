import type { AccountSummary, AccountSummaryApi, AccountSummaryContext } from "../reference/src/account-summary";

export function createAccountSummaryContext(api: AccountSummaryApi): AccountSummaryContext {
  const summaries = new Map<string, Promise<AccountSummary | null>>();
  return {
    loadAccountSummary(input) {
      const accountId = input.accountId.trim();
      if (!accountId) return Promise.resolve(null);
      const existing = summaries.get(accountId);
      if (existing) return existing;
      const summary = (async () => {
        const account = await api.getAccount(accountId);
        if (!account) return null;
        return { account, permissions: await api.getPermissions(account.id) };
      })();
      summaries.set(accountId, summary);
      return summary;
    },
  };
}
