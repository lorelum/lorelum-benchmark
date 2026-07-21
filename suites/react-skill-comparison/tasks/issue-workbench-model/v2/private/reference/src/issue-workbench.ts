export type IssueStatus = "open" | "closed";

export interface Issue {
  id: string;
  title: string;
  status: IssueStatus;
}

export interface IssueRow {
  id: string;
  title: string;
  status: IssueStatus;
  selected: boolean;
  onOpen(): void;
  onSelect(): void;
}

type CachedRow = { signature: string; row: IssueRow };

export function createIssueWorkbench(onOpen: (issueId: string) => void) {
  let selectedIssueId: string | null = null;
  const cache = new Map<string, CachedRow>();

  return {
    select(issueId: string | null) {
      selectedIssueId = issueId;
    },
    render(issues: Issue[], filter: { query: string; status: IssueStatus | "all" }): IssueRow[] {
      const query = filter.query.trim().toLowerCase();
      const availableIds = new Set(issues.map((issue) => issue.id));
      if (selectedIssueId && !availableIds.has(selectedIssueId)) selectedIssueId = null;

      return issues
        .filter((issue) => filter.status === "all" || issue.status === filter.status)
        .filter((issue) => !query || issue.title.toLowerCase().includes(query))
        .map((issue) => {
          const selected = issue.id === selectedIssueId;
          const signature = `${issue.title}\u0000${issue.status}\u0000${selected}`;
          const cached = cache.get(issue.id);
          if (cached?.signature === signature) return cached.row;
          const row: IssueRow = {
            id: issue.id,
            title: issue.title,
            status: issue.status,
            selected,
            onOpen: cached?.row.onOpen ?? (() => onOpen(issue.id)),
            onSelect: cached?.row.onSelect ?? (() => { selectedIssueId = issue.id; }),
          };
          cache.set(issue.id, { signature, row });
          return row;
        });
    },
  };
}
