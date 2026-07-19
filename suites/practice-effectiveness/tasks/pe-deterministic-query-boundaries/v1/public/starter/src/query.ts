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

export function queryItems(items: unknown, query: unknown): QueryResult {
  const values = Array.isArray(items) ? items as Item[] : [];
  const request = (query ?? {}) as Query;

  return {
    items: values,
    page: request.page ?? 1,
    pageSize: 2,
    total: values.length,
    error: null,
  };
}
