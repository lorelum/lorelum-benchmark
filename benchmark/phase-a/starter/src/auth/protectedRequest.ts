import type { AccessTokenStore, FetchLike } from './contracts.js';

export function createProtectedRequest(
  _fetch: FetchLike,
  _tokens: AccessTokenStore,
) {
  return async function protectedRequest(
    _input: RequestInfo | URL,
    _init: RequestInit = {},
  ): Promise<Response> {
    throw new Error('TODO: implement protected request recovery');
  };
}
