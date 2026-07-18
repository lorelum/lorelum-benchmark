export type IssueStatus = "open" | "closed";

export interface Issue {
  id: string;
  title: string;
  status: IssueStatus;
}

export interface IssueFilter {
  query: string;
  status: IssueStatus | "all";
}

export interface IssueRow {
  id: string;
  title: string;
  status: IssueStatus;
  selected: boolean;
  onOpen(): void;
  onSelect(): void;
}

export interface IssueWorkbench {
  select(issueId: string | null): void;
  render(issues: Issue[], filter: IssueFilter): IssueRow[];
}

export function createIssueWorkbench(onOpen: (issueId: string) => void): IssueWorkbench {
  let selectedIssueId: string | null = null;

  return {
    select(issueId) {
      selectedIssueId = issueId;
    },
    render(issues, filter) {
      const query = filter.query.trim().toLowerCase();
      const availableIds = new Set(issues.map((issue) => issue.id));
      if (selectedIssueId && !availableIds.has(selectedIssueId)) selectedIssueId = null;

      return issues
        .filter((issue) => filter.status === "all" || issue.status === filter.status)
        .filter((issue) => !query || issue.title.toLowerCase().includes(query))
        .map((issue) => ({
          id: issue.id,
          title: issue.title,
          status: issue.status,
          selected: issue.id === selectedIssueId,
          onOpen: () => onOpen(issue.id),
          onSelect: () => { selectedIssueId = issue.id; },
        }));
    },
  };
}
