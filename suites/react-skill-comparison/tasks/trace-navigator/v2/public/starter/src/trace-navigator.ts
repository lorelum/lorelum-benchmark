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

export function createTraceNavigator(_rows: readonly TraceRow[]): TraceNavigator {
  throw new Error("TODO");
}
