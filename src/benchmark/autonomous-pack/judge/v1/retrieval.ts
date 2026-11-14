export type RetrievalEvent = {
  operation: "query" | "get" | "unknown";
  request: string | null;
  status: "success" | "empty" | "not-found" | "failed" | "indeterminate";
  resultCount: number | null;
  errorCode: string | null;
};

/** Extract only observed fixed-wrapper calls. Other shell/file access remains unobservable. */
export function observeRetrieval(actions: unknown, observations: unknown): RetrievalEvent[] {
  if (!Array.isArray(actions) || !Array.isArray(observations)) return [];
  const events: RetrievalEvent[] = [];
  let operation: RetrievalEvent["operation"] = "unknown", request: string | null = null, index = 0;
  for (const action of actions) {
    if (!action || typeof action !== "object" || Array.isArray(action)) break;
    if (action.type === "done") break;
    const observation = observations[index++];
    if (action.type === "write" && action.path === "support/request.txt" && typeof action.content === "string") {
      if (observation && typeof observation === "object" && observation.type === "write" && observation.path === action.path) {
        const [name, ...lines] = action.content.split("\n");
        operation = name === "query" || name === "get" ? name : "unknown";
        request = lines.join("\n").replace(/\n$/, "");
      } else { operation = "unknown"; request = null; }
    }
    if (action.type !== "command" || action.index !== 0) continue;
    const event: RetrievalEvent = { operation, request, status: "indeterminate", resultCount: null, errorCode: null };
    if (observation && typeof observation === "object" && observation.type === "command" && observation.index === 0 &&
        ["completed", "failed"].includes(observation.status) && typeof observation.exitCode === "number" && typeof observation.stdout === "string") {
      try {
        const value = JSON.parse(observation.stdout);
        if (value?.ok === true && observation.status === "completed" && observation.exitCode === 0) {
          const results = value.data?.results;
          event.resultCount = Array.isArray(results) ? results.length : null;
          event.status = operation === "query" && event.resultCount === 0 ? "empty" : "success";
        } else if (value?.ok === false && typeof value.error?.code === "string") {
          event.errorCode = value.error.code;
          event.status = value.error.code === "practice.not-found" ? "not-found" : "failed";
        }
      } catch { /* Truncated or malformed output is not a retrieval outcome. */ }
    }
    events.push(event);
  }
  return events;
}
