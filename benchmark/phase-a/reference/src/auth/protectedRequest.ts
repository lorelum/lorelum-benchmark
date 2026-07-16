import {
  type AccessTokenStore,
  type FetchLike,
  SessionExpiredError,
} from './contracts.js';

function withAuthorization(init: RequestInit, token: string | null): RequestInit {
  return {
    ...init,
    credentials: 'include',
    headers: {
      ...init.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
}

export function createProtectedRequest(fetch: FetchLike, tokens: AccessTokenStore) {
  let refreshInFlight: Promise<string> | null = null;

  async function refreshAccessToken(): Promise<string> {
    if (!refreshInFlight) {
      refreshInFlight = fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      })
        .then(async (response) => {
          if (!response.ok) throw new SessionExpiredError();
          const payload = (await response.json()) as { accessToken: string };
          return payload.accessToken;
        })
        .then((token) => {
          tokens.setAccessToken(token);
          return token;
        })
        .finally(() => {
          refreshInFlight = null;
        });
    }

    return refreshInFlight;
  }

  return async function protectedRequest(
    input: RequestInfo | URL,
    init: RequestInit = {},
  ): Promise<Response> {
    const first = await fetch(input, withAuthorization(init, tokens.getAccessToken()));
    if (first.status !== 401) return first;

    let refreshedToken: string;
    try {
      refreshedToken = await refreshAccessToken();
    } catch {
      tokens.clear();
      throw new SessionExpiredError();
    }

    const retry = await fetch(input, withAuthorization(init, refreshedToken));
    if (retry.status === 401) {
      tokens.clear();
      throw new SessionExpiredError();
    }

    return retry;
  };
}
