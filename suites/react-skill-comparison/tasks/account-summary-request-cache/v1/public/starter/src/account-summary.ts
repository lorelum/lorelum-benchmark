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
  return {
    async loadAccountSummary(input) {
      const accountId = input.accountId.trim();
      if (!accountId) return null;

      const account = await api.getAccount(accountId);
      if (!account) return null;
      const permissions = await api.getPermissions(account.id);
      return { account, permissions };
    },
  };
}
