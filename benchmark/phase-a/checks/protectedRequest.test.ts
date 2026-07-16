import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  type AccessTokenStore,
  type FetchLike,
  SessionExpiredError,
} from './contracts.js';
import { createProtectedRequest } from './protectedRequest.js';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function createTokenStore(token: string | null): AccessTokenStore & { clearCalls: number } {
  let current = token;
  return {
    clearCalls: 0,
    getAccessToken: () => current,
    setAccessToken: (next) => {
      current = next;
    },
    clear() {
      this.clearCalls += 1;
      current = null;
    },
  };
}

function authorization(init?: RequestInit): string | null {
  const headers = new Headers(init?.headers);
  return headers.get('authorization');
}

describe('createProtectedRequest', () => {
  it('coalesces concurrent refreshes and retries every original request once', async () => {
    const tokenStore = createTokenStore('expired-token');
    let refreshCalls = 0;
    const protectedCalls: Array<{ authorization: string | null; credentials?: RequestCredentials }> = [];

    const fetch: FetchLike = async (input, init) => {
      if (String(input) === '/api/auth/refresh') {
        refreshCalls += 1;
        await Promise.resolve();
        return json({ accessToken: 'fresh-token' });
      }

      protectedCalls.push({
        authorization: authorization(init),
        credentials: init?.credentials,
      });
      return authorization(init) === 'Bearer fresh-token'
        ? json({ ok: true })
        : new Response(null, { status: 401 });
    };

    const protectedRequest = createProtectedRequest(fetch, tokenStore);
    const responses = await Promise.all([
      protectedRequest('/api/projects'),
      protectedRequest('/api/projects'),
      protectedRequest('/api/projects'),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
    expect(refreshCalls).toBe(1);
    expect(protectedCalls).toHaveLength(6);
    expect(protectedCalls.slice(0, 3).map((call) => call.authorization)).toEqual([
      'Bearer expired-token',
      'Bearer expired-token',
      'Bearer expired-token',
    ]);
    expect(protectedCalls.slice(3).map((call) => call.authorization)).toEqual([
      'Bearer fresh-token',
      'Bearer fresh-token',
      'Bearer fresh-token',
    ]);
    expect(protectedCalls.every((call) => call.credentials === 'include')).toBe(true);
  });

  it('clears the token and terminates when refresh fails', async () => {
    const tokenStore = createTokenStore('expired-token');
    const fetch: FetchLike = async (input) =>
      String(input) === '/api/auth/refresh'
        ? new Response(null, { status: 401 })
        : new Response(null, { status: 401 });

    const protectedRequest = createProtectedRequest(fetch, tokenStore);

    await expect(protectedRequest('/api/projects')).rejects.toBeInstanceOf(SessionExpiredError);
    expect(tokenStore.getAccessToken()).toBeNull();
    expect(tokenStore.clearCalls).toBe(1);
  });

  it('does not refresh or retry indefinitely after the retried request is still unauthorized', async () => {
    const tokenStore = createTokenStore('expired-token');
    let refreshCalls = 0;
    let protectedCalls = 0;
    const fetch: FetchLike = async (input) => {
      if (String(input) === '/api/auth/refresh') {
        refreshCalls += 1;
        return json({ accessToken: 'fresh-token' });
      }
      protectedCalls += 1;
      return new Response(null, { status: 401 });
    };

    const protectedRequest = createProtectedRequest(fetch, tokenStore);

    await expect(protectedRequest('/api/projects')).rejects.toBeInstanceOf(SessionExpiredError);
    expect(refreshCalls).toBe(1);
    expect(protectedCalls).toBe(2);
    expect(tokenStore.clearCalls).toBe(1);
  });

  it('does not add durable Web Storage access to the protected request module', async () => {
    const sourcePath = fileURLToPath(
      new URL('./protectedRequest.ts', import.meta.url),
    );
    const source = await readFile(sourcePath, 'utf8');

    expect(source).not.toMatch(/\b(localStorage|sessionStorage)\b/);
  });
});
