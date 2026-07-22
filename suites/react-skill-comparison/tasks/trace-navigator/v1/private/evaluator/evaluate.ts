import { expect } from "bun:test";
import { pathToFileURL } from "node:url";
import { evaluateV2 } from "../../../../../../../src/benchmark/evaluator/v2/harness";

type TraceRow = { spanId: string; parentSpanId?: string | null; visible: boolean };
type Direction = "next" | "previous";
type Step = { spanId: string; position: number };
type Navigator = { locate(spanId: string): number | null; parentOf(spanId: string): number | null; step(spanId: string, direction: Direction): Step | null; replace(rows: readonly TraceRow[]): void };
type CreateNavigator = (rows: readonly TraceRow[]) => Navigator;
type Counters = { find: number; findIndex: number; traversals: number; indexedReads: number };

function rows(): TraceRow[] {
  return [
    { spanId: "root-a", visible: true },
    { spanId: "hidden-b", parentSpanId: "root-a", visible: false },
    { spanId: "visible-c", parentSpanId: "root-a", visible: true },
    { spanId: "visible-d", parentSpanId: "visible-c", visible: true },
    { spanId: "root-e", visible: true },
  ];
}

function monitoredRows(values: TraceRow[]): { rows: readonly TraceRow[]; counters: Counters } {
  const counters: Counters = { find: 0, findIndex: 0, traversals: 0, indexedReads: 0 };
  const wrap = (items: TraceRow[]): readonly TraceRow[] => new Proxy(items, {
    get(target, property, receiver) {
      if (property === "find") return (...args: unknown[]) => { counters.find += 1; return Reflect.apply(target.find, target, args); };
      if (property === "findIndex") return (...args: unknown[]) => { counters.findIndex += 1; return Reflect.apply(target.findIndex, target, args); };
      if (property === Symbol.iterator) return () => { counters.traversals += 1; return target[Symbol.iterator](); };
      if (property === "map" || property === "filter" || property === "forEach" || property === "reduce") return (...args: unknown[]) => {
        counters.traversals += 1;
        return Reflect.apply(target[property] as Function, target, args);
      };
      if (typeof property === "string" && /^(0|[1-9][0-9]*)$/.test(property)) counters.indexedReads += 1;
      return Reflect.get(target, property, receiver);
    },
  });
  return { rows: wrap(values.map((row) => ({ ...row }))), counters };
}

function longRows(length = 160): TraceRow[] {
  return Array.from({ length }, (_, index) => ({ spanId: `span-${index}`, parentSpanId: index === 0 ? null : `span-${index - 1}`, visible: index % 4 !== 1 }));
}

async function reader(path: string): Promise<CreateNavigator> {
  return (await import(`${pathToFileURL(path).href}?run=${Date.now()}`) as { createTraceNavigator: CreateNavigator }).createTraceNavigator;
}

export async function evaluateCandidate({ candidatePath }: { candidatePath: string }) {
  const createTraceNavigator = await reader(candidatePath);
  return evaluateV2([
    {
      id: "positions-parents-and-visible-steps-follow-the-snapshot",
      run() {
        const navigator = createTraceNavigator(rows());
        expect(navigator.locate("root-a")).toBe(0);
        expect(navigator.locate("visible-d")).toBe(3);
        expect(navigator.locate(" ")).toBeNull();
        expect(navigator.locate("absent")).toBeNull();
        expect(navigator.parentOf("root-a")).toBeNull();
        expect(navigator.parentOf("hidden-b")).toBe(0);
        expect(navigator.parentOf("visible-d")).toBe(2);
        expect(navigator.step("root-a", "next")).toEqual({ spanId: "visible-c", position: 2 });
        expect(navigator.step("visible-c", "previous")).toEqual({ spanId: "root-a", position: 0 });
        expect(navigator.step("visible-d", "next")).toEqual({ spanId: "root-e", position: 4 });
        expect(navigator.step("root-a", "previous")).toBeNull();
        expect(navigator.step("hidden-b", "next")).toBeNull();
      },
    },
    {
      id: "invalid-construction-and-replacement-are-atomic",
      run() {
        expect(() => createTraceNavigator([{ spanId: "dup", visible: true }, { spanId: "dup", visible: true }])).toThrow();
        expect(() => createTraceNavigator([{ spanId: "child", parentSpanId: "missing", visible: true }])).toThrow();
        const navigator = createTraceNavigator(rows());
        expect(() => navigator.replace([{ spanId: "fresh", parentSpanId: "missing", visible: true }])).toThrow();
        expect(navigator.locate("visible-c")).toBe(2);
        expect(navigator.parentOf("visible-d")).toBe(2);
      },
    },
    {
      id: "replacement-evicts-old-relations-and-inputs-remain-independent",
      run() {
        const input = rows();
        const navigator = createTraceNavigator(input);
        input[0]!.visible = false;
        expect(navigator.step("root-a", "next")).toEqual({ spanId: "visible-c", position: 2 });
        const next = [{ spanId: "new-root", visible: true }, { spanId: "new-child", parentSpanId: "new-root", visible: true }];
        navigator.replace(next);
        next[1]!.parentSpanId = null;
        expect(navigator.locate("root-a")).toBeNull();
        expect(navigator.parentOf("new-child")).toBe(0);
        expect(navigator.step("new-root", "next")).toEqual({ spanId: "new-child", position: 1 });
      },
    },
    {
      id: "independent-navigators-do-not-share-state",
      run() {
        const left = createTraceNavigator([{ spanId: "same", visible: true }, { spanId: "left", parentSpanId: "same", visible: true }]);
        const right = createTraceNavigator([{ spanId: "same", visible: true }, { spanId: "right", parentSpanId: "same", visible: true }]);
        left.replace([{ spanId: "left-only", visible: true }]);
        expect(right.locate("same")).toBe(0);
        expect(right.parentOf("right")).toBe(0);
      },
    },
  ], [
    {
      id: "repeated-location-and-parent-resolution-avoid-row-searches",
      maxPoints: 45,
      run() {
        const monitored = monitoredRows(longRows());
        const navigator = createTraceNavigator(monitored.rows);
        monitored.counters.find = 0;
        monitored.counters.findIndex = 0;
        monitored.counters.traversals = 0;
        monitored.counters.indexedReads = 0;
        for (let index = 0; index < 120; index += 1) {
          const id = `span-${(index * 13) % 160}`;
          navigator.locate(id);
          navigator.parentOf(id);
        }
        return monitored.counters.find === 0 && monitored.counters.findIndex === 0 && monitored.counters.traversals <= 2 && monitored.counters.indexedReads <= 4 ? 45 : 0;
      },
    },
    {
      id: "replacement-has-bounded-snapshot-work",
      maxPoints: 30,
      run() {
        const navigator = createTraceNavigator(longRows());
        const monitored = monitoredRows(longRows().map((row, index) => ({ ...row, spanId: `replacement-${index}`, parentSpanId: index === 0 ? null : `replacement-${index - 1}` })));
        navigator.replace(monitored.rows);
        return monitored.counters.traversals <= 3 && monitored.counters.indexedReads <= monitored.rows.length ? 30 : 0;
      },
    },
    {
      id: "replacement-answers-only-from-current-snapshot",
      maxPoints: 25,
      run() {
        const navigator = createTraceNavigator([{ spanId: "old", visible: true }]);
        navigator.replace([{ spanId: "current", visible: true }, { spanId: "child", parentSpanId: "current", visible: true }]);
        return navigator.locate("old") === null && navigator.parentOf("child") === 0 && navigator.step("current", "next")?.spanId === "child" ? 25 : 0;
      },
    },
  ]);
}
