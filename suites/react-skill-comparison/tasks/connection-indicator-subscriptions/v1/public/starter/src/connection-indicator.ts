export type ConnectionState = "online" | "offline";
export interface ConnectionSource { subscribe(listener: (value: unknown) => void): () => void; }
export interface ConnectionIndicator { subscribe(listener: (state: ConnectionState) => void): () => void; }
export function createConnectionIndicator(source: ConnectionSource, initial: ConnectionState): ConnectionIndicator { return { subscribe(listener) { listener(initial); return source.subscribe((value) => { if (value === "online" || value === "offline") listener(value); }); } }; }
