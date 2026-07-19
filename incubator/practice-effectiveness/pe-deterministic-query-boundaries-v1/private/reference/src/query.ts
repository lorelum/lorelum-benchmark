export type Domain = "docs" | "guides";
export type Status = "active" | "archived";

export interface Item {
  id: string;
  title: string;
  domain: Domain;
  status: Status;
  tags: string[];
}

export interface Query {
  domain?: Domain;
  status?: Status;
  tags?: string[];
  page?: number;
}

export interface QueryError {
  code: "invalid-query" | "out-of-range";
  message: string;
}

export interface QueryResult {
  items: Item[];
  page: number;
  pageSize: number;
  total: number;
  error: QueryError | null;
}

const pageSize = 2;
const domains = new Set<Domain>(["docs", "guides"]);
const statuses = new Set<Status>(["active", "archived"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function invalid(message: string): QueryResult {
  return { items: [], page: 1, pageSize, total: 0, error: { code: "invalid-query", message } };
}

export function queryItems(items: unknown, query: unknown): QueryResult {
  if (!Array.isArray(items)) return invalid("Items must be an array");
  if (!isRecord(query)) return invalid("Query must be an object");

  const domain = query.domain;
  const status = query.status;
  const page = query.page ?? 1;
  const requestedTags = query.tags ?? [];

  if (domain !== undefined && (typeof domain !== "string" || !domains.has(domain as Domain))) return invalid("Unknown domain");
  if (status !== undefined && (typeof status !== "string" || !statuses.has(status as Status))) return invalid("Unknown status");
  if (!Array.isArray(requestedTags) || !requestedTags.every((tag) => typeof tag === "string")) return invalid("Tags must be strings");
  if (typeof page !== "number" || !Number.isInteger(page) || page < 1) return invalid("Page must be a positive integer");

  const tags = [...new Set(requestedTags)];
  const filtered = (items as Item[])
    .filter((item) => isRecord(item) && typeof item.id === "string" && typeof item.title === "string" && domains.has(item.domain as Domain) && statuses.has(item.status as Status) && Array.isArray(item.tags) && item.tags.every((tag) => typeof tag === "string"))
    .filter((item) => (domain === undefined || item.domain === domain) && (status === undefined || item.status === status) && tags.every((tag) => item.tags.includes(tag)))
    .sort((left, right) => compareText(left.id, right.id));
  const total = filtered.length;
  const start = (page - 1) * pageSize;

  if (total > 0 && start >= total) {
    return { items: [], page, pageSize, total, error: { code: "out-of-range", message: "Page is outside the result set" } };
  }

  return { items: filtered.slice(start, start + pageSize), page, pageSize, total, error: null };
}
