export async function withRetry<T>(action: () => Promise<T>, attempts = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try { return await action(); } catch (error) { lastError = error; }
  }
  throw lastError;
}
