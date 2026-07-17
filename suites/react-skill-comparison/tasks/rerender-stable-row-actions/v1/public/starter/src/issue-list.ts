export interface Issue {
  id: string;
  title: string;
}

export interface IssueRow {
  id: string;
  title: string;
  onOpen(): void;
}

export function createIssueList(onOpen: (issueId: string) => void) {
  return {
    render(issues: Issue[], query: string): IssueRow[] {
      const normalizedQuery = query.toLowerCase();

      return issues
        .filter((issue) => issue.title.toLowerCase().includes(normalizedQuery))
        .map((issue) => ({
          id: issue.id,
          title: issue.title,
          onOpen: () => onOpen(issue.id),
        }));
    },
  };
}
