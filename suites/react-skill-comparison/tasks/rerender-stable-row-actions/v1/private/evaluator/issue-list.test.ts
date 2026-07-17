import { describe, expect, test } from "bun:test";

interface Issue {
  id: string;
  title: string;
}

interface IssueRow {
  id: string;
  title: string;
  onOpen(): void;
}

interface IssueList {
  render(issues: Issue[], query: string): IssueRow[];
}

interface IssueListModule {
  createIssueList(onOpen: (issueId: string) => void): IssueList;
}

const candidatePath =
  Bun.env.CANDIDATE_PATH ??
  "suites/react-skill-comparison/tasks/rerender-stable-row-actions/v1/public/starter/src/issue-list.ts";
const candidateUrl = `${Bun.pathToFileURL(candidatePath).href}?run=${Date.now()}`;
const { createIssueList } = (await import(candidateUrl)) as IssueListModule;

describe("rerender-stable-row-actions-v1", () => {
  test("keeps callbacks stable for unchanged visible rows", () => {
    const openedIssues: string[] = [];
    const list = createIssueList((issueId) => {
      openedIssues.push(issueId);
    });
    const issues = [
      { id: "issue-1", title: "Fix checkout" },
      { id: "issue-2", title: "Improve search" },
    ];

    const firstRows = list.render(issues, "");
    const secondRows = list.render(issues, "");
    const filteredRows = list.render(issues, "search");

    expect(secondRows[0]?.onOpen).toBe(firstRows[0]?.onOpen);
    expect(secondRows[1]?.onOpen).toBe(firstRows[1]?.onOpen);
    expect(filteredRows[0]?.onOpen).toBe(firstRows[1]?.onOpen);

    filteredRows[0]?.onOpen();
    expect(openedIssues).toEqual(["issue-2"]);
  });
});
