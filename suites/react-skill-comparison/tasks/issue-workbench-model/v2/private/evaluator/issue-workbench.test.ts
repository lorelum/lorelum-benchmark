import { describe, expect, test } from "bun:test";

type IssueStatus = "open" | "closed";

interface Issue {
  id: string;
  title: string;
  status: IssueStatus;
}

interface IssueRow {
  id: string;
  title: string;
  status: IssueStatus;
  selected: boolean;
  onOpen(): void;
  onSelect(): void;
}

interface IssueWorkbench {
  select(issueId: string | null): void;
  render(issues: Issue[], filter: { query: string; status: IssueStatus | "all" }): IssueRow[];
}

interface IssueWorkbenchModule {
  createIssueWorkbench(onOpen: (issueId: string) => void): IssueWorkbench;
}

const candidatePath = Bun.env.CANDIDATE_PATH ?? "suites/react-skill-comparison/tasks/issue-workbench-model/v2/public/starter/src/issue-workbench.ts";
const candidateUrl = `${Bun.pathToFileURL(candidatePath).href}?run=${Date.now()}`;
const { createIssueWorkbench } = (await import(candidateUrl)) as IssueWorkbenchModule;

const all = { query: "", status: "all" as const };
const issues: Issue[] = [
  { id: "issue-1", title: "Fix checkout", status: "open" },
  { id: "issue-2", title: "Improve search", status: "open" },
  { id: "issue-3", title: "Archive legacy flag", status: "closed" },
];

describe("issue-workbench-model-v2", () => {
  test("keeps unchanged rows and callbacks stable across equivalent renders", () => {
    const opened: string[] = [];
    const workbench = createIssueWorkbench((id) => opened.push(id));
    const first = workbench.render(issues, all);
    const second = workbench.render([...issues], all);
    const search = workbench.render([...issues], { query: "SEARCH", status: "all" });
    const restored = workbench.render([...issues], all);

    expect(second.map(({ id, title, status, selected }) => ({ id, title, status, selected }))).toEqual(first.map(({ id, title, status, selected }) => ({ id, title, status, selected })));
    expect(second[0]).toBe(first[0]);
    expect(second[1]).toBe(first[1]);
    expect(search[0]).toBe(first[1]);
    expect(restored[1]).toBe(first[1]);
    expect(restored[1]?.onOpen).toBe(first[1]?.onOpen);
    expect(restored[1]?.onSelect).toBe(first[1]?.onSelect);
    restored[1]?.onOpen();
    expect(opened).toEqual(["issue-2"]);
  });

  test("localizes invalidation while preserving selection, order, and callbacks", () => {
    const workbench = createIssueWorkbench(() => {});
    const first = workbench.render(issues, all);
    const originalOpen = first[1]?.onOpen;
    const originalSelect = first[1]?.onSelect;
    first[1]?.onSelect();
    const selected = workbench.render([...issues], all);
    const changed = workbench.render([
      issues[0]!,
      { ...issues[1]!, title: "Improve global search" },
      issues[2]!,
    ], all);

    expect(selected.map((row) => row.selected)).toEqual([false, true, false]);
    expect(selected[0]).toBe(first[0]);
    expect(selected[1]).not.toBe(first[1]);
    expect(selected[1]?.onOpen).toBe(originalOpen);
    expect(selected[1]?.onSelect).toBe(originalSelect);
    expect(changed[0]).toBe(selected[0]);
    expect(changed[1]).not.toBe(selected[1]);
    expect(changed[1]?.onOpen).toBe(originalOpen);
    expect(changed[1]?.onSelect).toBe(originalSelect);
    expect(changed[2]).toBe(selected[2]);
    expect(changed.map((row) => row.id)).toEqual(["issue-1", "issue-2", "issue-3"]);
  });

  test("clears a removed selection without disturbing remaining rows", () => {
    const workbench = createIssueWorkbench(() => {});
    const first = workbench.render(issues, all);
    workbench.select("issue-2");
    workbench.render(issues, all);
    const remaining = workbench.render([issues[0]!, issues[2]!], all);

    expect(remaining.map((row) => row.selected)).toEqual([false, false]);
    expect(remaining[0]).toBe(first[0]);
    expect(remaining[1]).toBe(first[2]);
  });
});
