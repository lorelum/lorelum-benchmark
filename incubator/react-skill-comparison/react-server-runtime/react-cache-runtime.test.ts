import { Suspense, cache, createElement, use } from "react";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { renderToReadableStream } from "react-server-dom-webpack/server.node";
import { expect, test } from "bun:test";

async function render(element: ReturnType<typeof createElement>, onError?: (error: unknown) => void): Promise<string> {
  const stream = renderToReadableStream(element, {}, { onError });
  return new Response(stream).text();
}

function accountWorkspace(readAccount: (accountId: string) => Promise<string>, accountId: string) {
  function AccountPanel({ id }: { id: string }) {
    return createElement("span", null, use(readAccount(id)));
  }

  function Workspace() {
    return createElement(
      Suspense,
      { fallback: createElement("span", null, "loading") },
      createElement(AccountPanel, { id: accountId }),
      createElement(AccountPanel, { id: accountId })
    );
  }

  return createElement(Workspace);
}

test("React.cache deduplicates equal primitive arguments in one server render", async () => {
  let calls = 0;
  const readAccount = cache(async (accountId: string) => {
    calls += 1;
    return `account:${accountId}`;
  });

  const output = await render(accountWorkspace(readAccount, "acct-42"));

  expect(output).toContain("account:acct-42");
  expect(calls).toBe(1);
});

test("React.cache clears its cache scope between server renders", async () => {
  let calls = 0;
  const readAccount = cache(async (accountId: string) => {
    calls += 1;
    return `account:${accountId}:${calls}`;
  });

  const first = await render(accountWorkspace(readAccount, "acct-42"));
  const second = await render(accountWorkspace(readAccount, "acct-42"));

  expect(first).toContain("account:acct-42:1");
  expect(second).toContain("account:acct-42:2");
  expect(calls).toBe(2);
});

test("React.cache exposes an original rejection and permits a later render retry", async () => {
  const rejection = new Error("repository unavailable");
  let calls = 0;
  let observed: unknown;
  const readAccount = cache(async (accountId: string) => {
    calls += 1;
    if (calls === 1) throw rejection;
    return `account:${accountId}:recovered`;
  });

  await render(accountWorkspace(readAccount, "acct-42"), (error) => {
    observed = error;
  });
  const retryOutput = await render(accountWorkspace(readAccount, "acct-42"));

  expect(calls).toBe(2);
  expect(observed).toBe(rejection);
  expect(retryOutput).toContain("account:acct-42:recovered");
});

test("staged candidate source resolves the pinned React runtime", async () => {
  const candidatePath = join(import.meta.dir, `.candidate-${crypto.randomUUID()}.ts`);
  await Bun.write(candidatePath, [
    'import { cache } from "react";',
    'export const read = cache(async (id: string) => `account:${id}`);'
  ].join("\n"));
  try {
    const candidate = await import(`${Bun.pathToFileURL(candidatePath).href}?run=${Date.now()}`) as { read: (id: string) => Promise<string> };
    const output = await render(accountWorkspace(candidate.read, "acct-42"));
    expect(output).toContain("account:acct-42");
  } finally {
    await rm(candidatePath, { force: true });
  }
});
