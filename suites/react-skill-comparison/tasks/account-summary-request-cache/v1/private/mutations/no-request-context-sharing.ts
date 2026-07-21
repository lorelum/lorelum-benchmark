import type { AccountSummary, AccountSummaryApi, AccountSummaryContext } from "../reference/src/account-summary";

export function createAccountSummaryContext(api: AccountSummaryApi): AccountSummaryContext {
  return {
    async loadAccountSummary(input): Promise<AccountSummary | null> {
      const accountId = input.accountId.trim();
      if (!accountId) return null;
      const account = await api.getAccount(accountId);
      if (!account) return null;
      const permissions = await api.getPermissions(account.id);
      return { account, permissions };
    },
  };
}
