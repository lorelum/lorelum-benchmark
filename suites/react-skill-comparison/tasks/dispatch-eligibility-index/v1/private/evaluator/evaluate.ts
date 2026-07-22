import { expect } from "bun:test";
import { pathToFileURL } from "node:url";
import { evaluateV2 } from "../../../../../../../src/benchmark/evaluator/v2/harness";

type WorkItem = { id: string; status: "queued" | "active" | "complete"; assigneeId?: string | null };
type DispatchPlan = { dispatchableIds: string[]; blocked: Array<{ id: string; reason: "unassigned" | "ineligible" }> };
type BuildDispatchPlan = (items: readonly WorkItem[], eligibleAssigneeIds: readonly string[]) => DispatchPlan;

type RosterCounters = { includes: number; traversals: number; indexedReads: number };

function monitoredRoster(values: string[]): { roster: readonly string[]; counters: RosterCounters } {
  const counters: RosterCounters = { includes: 0, traversals: 0, indexedReads: 0 };
  const wrap = (values: string[]): readonly string[] => new Proxy(values, {
    get(target, property, receiver) {
      if (property === "includes") return (value: string, fromIndex?: number) => {
        counters.includes += 1;
        return target.includes(value, fromIndex);
      };
      if (property === Symbol.iterator) return () => {
        counters.traversals += 1;
        return target[Symbol.iterator]();
      };
      if (property === "map" || property === "filter") return (...args: unknown[]) => {
        counters.traversals += 1;
        const result = Reflect.apply(target[property] as Function, target, args) as string[];
        return wrap(result);
      };
      if (property === "forEach" || property === "reduce") return (...args: unknown[]) => {
        counters.traversals += 1;
        return Reflect.apply(target[property] as Function, target, args);
      };
      if (typeof property === "string" && /^(0|[1-9][0-9]*)$/.test(property)) counters.indexedReads += 1;
      return Reflect.get(target, property, receiver);
    },
  });
  return { roster: wrap([...values]), counters };
}

function queue(): WorkItem[] {
  return [
    { id: "work-1", status: "queued", assigneeId: " north " },
    { id: "work-2", status: "active", assigneeId: "south" },
    { id: "work-3", status: "queued", assigneeId: "" },
    { id: "work-4", status: "queued", assigneeId: "east" },
    { id: "work-5", status: "complete", assigneeId: "north" },
    { id: "work-6", status: "queued", assigneeId: null },
    { id: "work-7", status: "queued", assigneeId: "south" },
  ];
}

function largeQueue(): WorkItem[] {
  return Array.from({ length: 180 }, (_, index) => ({
    id: `bulk-${index}`,
    status: "queued" as const,
    assigneeId: index % 3 === 0 ? "north" : index % 3 === 1 ? "south" : "east",
  }));
}

async function reader(path: string): Promise<BuildDispatchPlan> {
  return (await import(`${pathToFileURL(path).href}?run=${Date.now()}`) as { buildDispatchPlan: BuildDispatchPlan }).buildDispatchPlan;
}

export async function evaluateCandidate({ candidatePath }: { candidatePath: string }) {
  const buildDispatchPlan = await reader(candidatePath);
  return evaluateV2([
    {
      id: "ordered-queued-items-are-classified-once",
      run() {
        expect(buildDispatchPlan(queue(), ["north", "south"])).toEqual({
          dispatchableIds: ["work-1", "work-7"],
          blocked: [
            { id: "work-3", reason: "unassigned" },
            { id: "work-4", reason: "ineligible" },
            { id: "work-6", reason: "unassigned" },
          ],
        });
      },
    },
    {
      id: "roster-and-assignee-identifiers-are-normalized",
      run() {
        expect(buildDispatchPlan([{ id: "work-8", status: "queued", assigneeId: " south " }], [" ", " south ", ""]))
          .toEqual({ dispatchableIds: ["work-8"], blocked: [] });
      },
    },
    {
      id: "inputs-are-not-mutated",
      run() {
        const items = queue();
        const roster = [" north ", "south", "south", " "];
        const beforeItems = structuredClone(items);
        const beforeRoster = structuredClone(roster);
        buildDispatchPlan(items, roster);
        expect(items).toEqual(beforeItems);
        expect(roster).toEqual(beforeRoster);
      },
    },
    {
      id: "invalid-id-is-rejected-and-later-call-is-independent",
      run() {
        expect(() => buildDispatchPlan([
          { id: "work-9", status: "queued", assigneeId: "north" },
          { id: "work-9", status: "queued", assigneeId: "north" },
        ], ["north"])).toThrow();
        expect(buildDispatchPlan([{ id: "work-10", status: "queued", assigneeId: "south" }], ["south"]))
          .toEqual({ dispatchableIds: ["work-10"], blocked: [] });
      },
    },
    {
      id: "rosters-do-not-leak-across-invocations",
      run() {
        const items = [{ id: "work-11", status: "queued" as const, assigneeId: "north" }];
        expect(buildDispatchPlan(items, ["north"])).toEqual({ dispatchableIds: ["work-11"], blocked: [] });
        expect(buildDispatchPlan(items, ["south"])).toEqual({ dispatchableIds: [], blocked: [{ id: "work-11", reason: "ineligible" }] });
      },
    },
  ], [
    {
      id: "repeated-membership-does-not-scan-the-roster",
      maxPoints: 70,
      run() {
        const monitored = monitoredRoster(Array.from({ length: 80 }, (_, index) => `operator-${index}`).concat(["north", "south", "east"]));
        buildDispatchPlan(largeQueue(), monitored.roster);
        return monitored.counters.includes === 0 ? 70 : 0;
      },
    },
    {
      id: "roster-materialization-is-bounded-per-invocation",
      maxPoints: 30,
      run() {
        const monitored = monitoredRoster(Array.from({ length: 80 }, (_, index) => `operator-${index}`).concat(["north", "south", "east"]));
        buildDispatchPlan(largeQueue(), monitored.roster);
        const boundedSourcePasses = monitored.counters.traversals <= 3 && monitored.counters.indexedReads <= monitored.roster.length;
        return boundedSourcePasses ? 30 : 0;
      },
    },
  ]);
}
