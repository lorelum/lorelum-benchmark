export interface TraceRow {
  spanId: string;
  parentSpanId?: string | null;
  visible: boolean;
}

export type TraceDirection = "next" | "previous";
export type TraceStep = { spanId: string; position: number };

export interface TraceNavigator {
  locate(spanId: string): number | null;
  parentOf(spanId: string): number | null;
  step(spanId: string, direction: TraceDirection): TraceStep | null;
  replace(rows: readonly TraceRow[]): void;
}

type Snapshot = { rows: TraceRow[]; positions: Map<string, number>; parents: Map<string, number | null> };

function fail(message: string): never {
  throw new Error(message);
}

function snapshot(rows: readonly TraceRow[]): Snapshot {
  const copy: TraceRow[] = [];
  const positions = new Map<string, number>();
  for (const value of rows) {
    if (!value || typeof value !== "object" || typeof value.spanId !== "string" || value.spanId.trim().length === 0 || positions.has(value.spanId)) fail("Trace rows require unique non-empty span IDs");
    if (typeof value.visible !== "boolean") fail("Trace row visibility must be boolean");
    if (value.parentSpanId !== undefined && value.parentSpanId !== null && (typeof value.parentSpanId !== "string" || value.parentSpanId.trim().length === 0)) fail("Trace parent ID must be non-empty when present");
    positions.set(value.spanId, copy.length);
    copy.push({ spanId: value.spanId, parentSpanId: value.parentSpanId ?? null, visible: value.visible });
  }
  const parents = new Map<string, number | null>();
  for (const row of copy) {
    if (row.parentSpanId === null) parents.set(row.spanId, null);
    else {
      const parent = positions.get(row.parentSpanId);
      if (parent === undefined) fail("Trace parent must exist in the same snapshot");
      parents.set(row.spanId, parent);
    }
  }
  return { rows: copy, positions, parents };
}

function validQuery(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function createTraceNavigator(rows: readonly TraceRow[]): TraceNavigator {
  let current = snapshot(rows);
  return {
    locate(spanId) {
      if (!validQuery(spanId)) return null;
      return current.positions.get(spanId) ?? null;
    },
    parentOf(spanId) {
      if (!validQuery(spanId) || !current.positions.has(spanId)) return null;
      return current.parents.get(spanId) ?? null;
    },
    step(spanId, direction) {
      if (!validQuery(spanId) || (direction !== "next" && direction !== "previous")) return null;
      const position = current.positions.get(spanId);
      if (position === undefined || !current.rows[position]!.visible) return null;
      const increment = direction === "next" ? 1 : -1;
      for (let index = position + increment; index >= 0 && index < current.rows.length; index += increment) {
        const row = current.rows[index]!;
        if (row.visible) return { spanId: row.spanId, position: index };
      }
      return null;
    },
    replace(nextRows) {
      current = snapshot(nextRows);
    },
  };
}
