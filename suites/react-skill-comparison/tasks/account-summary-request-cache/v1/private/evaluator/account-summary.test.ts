import { describe, expect, test } from "bun:test";

interface Account {
  id: string;
  displayName: string;
}

interface Permissions {
  accountId: string;
  canManage: boolean;
}

interface AccountSummaryApi {
  getAccount(accountId: string): Promise<Account | null>;
  getPermissions(accountId: string): Promise<Permissions>;
}

interface AccountSummary {
  account: Account;
  permissions: Permissions;
}

interface AccountSummaryContext {
  loadAccountSummary(input: { accountId: string }): Promise<AccountSummary | null>;
}

interface AccountSummaryModule {
  createAccountSummaryContext(api: AccountSummaryApi): AccountSummaryContext;
}

interface Deferred<Value> {
  promise: Promise<Value>;
  resolve(value: Value): void;
}

function deferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

const candidatePath = Bun.env.CANDIDATE_PATH ?? "suites/react-skill-comparison/tasks/account-summary-request-cache/v1/public/starter/src/account-summary.ts";
const candidateUrl = `${Bun.pathToFileURL(candidatePath).href}?run=${Date.now()}`;
const { createAccountSummaryContext } = (await import(candidateUrl)) as AccountSummaryModule;

describe("account-summary-request-cache-v1", () => {
  test("avoids I/O for a blank account identifier", async () => {
    let calls = 0;
    const api: AccountSummaryApi = {
      async getAccount() { calls += 1; throw new Error("unexpected"); },
      async getPermissions() { calls += 1; throw new Error("unexpected"); },
    };

    await expect(createAccountSummaryContext(api).loadAccountSummary({ accountId: "  " })).resolves.toBeNull();
    expect(calls).toBe(0);
  });

  test("shares one same-context read but never shares it across contexts", async () => {
    const calls: string[] = [];
    const account = deferred<Account | null>();
    const permissions = deferred<Permissions>();
    const api: AccountSummaryApi = {
      getAccount(accountId) { calls.push(`account:${accountId}`); return account.promise; },
      getPermissions(accountId) { calls.push(`permissions:${accountId}`); return permissions.promise; },
    };
    const firstContext = createAccountSummaryContext(api);
    const first = firstContext.loadAccountSummary({ accountId: " acme " });
    const second = firstContext.loadAccountSummary({ accountId: "acme" });
    expect(calls).toEqual(["account:acme"]);

    account.resolve({ id: "acme", displayName: "Acme" });
    await flushMicrotasks();
    expect(calls).toEqual(["account:acme", "permissions:acme"]);
    permissions.resolve({ accountId: "acme", canManage: true });

    const firstSummary = await first;
    const secondSummary = await second;
    expect(firstSummary).toBe(secondSummary);

    const thirdSummary = await createAccountSummaryContext(api).loadAccountSummary({ accountId: "acme" });
    expect(calls).toEqual(["account:acme", "permissions:acme", "account:acme", "permissions:acme"]);
    expect(thirdSummary).not.toBe(firstSummary);
  });

  test("does not request permissions for a missing account", async () => {
    let permissionCalls = 0;
    const api: AccountSummaryApi = {
      async getAccount() { return null; },
      async getPermissions() { permissionCalls += 1; return { accountId: "unused", canManage: false }; },
    };

    await expect(createAccountSummaryContext(api).loadAccountSummary({ accountId: "missing" })).resolves.toBeNull();
    expect(permissionCalls).toBe(0);
  });

  test("preserves a rejected read and allows a retry in the same context", async () => {
    const expected = new Error("account unavailable");
    let accountCalls = 0;
    const api: AccountSummaryApi = {
      async getAccount() {
        accountCalls += 1;
        if (accountCalls === 1) throw expected;
        return { id: "acme", displayName: "Acme" };
      },
      async getPermissions() { return { accountId: "acme", canManage: true }; },
    };
    const context = createAccountSummaryContext(api);

    await expect(context.loadAccountSummary({ accountId: "acme" })).rejects.toBe(expected);
    await expect(context.loadAccountSummary({ accountId: "acme" })).resolves.toEqual({
      account: { id: "acme", displayName: "Acme" },
      permissions: { accountId: "acme", canManage: true },
    });
    expect(accountCalls).toBe(2);
  });
});
