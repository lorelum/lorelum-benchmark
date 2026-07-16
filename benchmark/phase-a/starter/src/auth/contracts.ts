export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface AccessTokenStore {
  getAccessToken(): string | null;
  setAccessToken(token: string): void;
  clear(): void;
}

export class SessionExpiredError extends Error {
  constructor() {
    super('Sign in again to continue');
    this.name = 'SessionExpiredError';
  }
}
