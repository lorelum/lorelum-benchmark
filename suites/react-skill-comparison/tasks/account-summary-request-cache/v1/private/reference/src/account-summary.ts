export interface Account {
  id: string;
  displayName: string;
}

export interface Permissions {
  accountId: string;
  canManage: boolean;
}

export interface AccountSummaryApi {
  getAccount(accountId: string): Promise<Account | null>;
  getPermissions(accountId: string): Promise<Permissions>;
}

export interface AccountSummary {
  account: Account;
  permissions: Permissions;
}

export interface AccountSummaryContext {
  loadAccountSummary(input: { accountId: string }): Promise<AccountSummary | null>;
}

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
        const permissions = await api.getPermissions(account.id);
        return { account, permissions };
      })();
      summaries.set(accountId, summary);
      void summary.catch(() => {
        if (summaries.get(accountId) === summary) summaries.delete(accountId);
      });
      return summary;
    },
  };
}
