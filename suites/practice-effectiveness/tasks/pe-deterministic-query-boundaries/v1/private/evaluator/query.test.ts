import { expect, test } from "bun:test";
import { join } from "node:path";

interface QueryResult {
  items: unknown[];
  page: number;
  pageSize: number;
  total: number;
  error: { code: string; message: string } | null;
}

interface CandidateModule {
  queryItems(items: unknown, query: unknown): QueryResult;
}

const candidatePath = Bun.env.CANDIDATE_PATH ?? join(import.meta.dir, "..", "..", "public", "starter", "src", "query.ts");
const candidateUrl = `${Bun.pathToFileURL(candidatePath).href}?candidate=${Date.now()}`;
const { queryItems } = (await import(candidateUrl)) as CandidateModule;

const items = [
  { id: "delta", title: "Delta", domain: "docs", status: "active", tags: ["release", "team"] },
  { id: "alpha", title: "Alpha", domain: "guides", status: "active", tags: ["onboarding"] },
  { id: "gamma", title: "Gamma", domain: "docs", status: "archived", tags: ["release"] },
  { id: "beta", title: "Beta", domain: "docs", status: "active", tags: ["release", "team"] },
  { id: "epsilon", title: "Epsilon", domain: "docs", status: "active", tags: ["team"] },
];

test("applies supported filters and returns the canonical first page", () => {
  expect(queryItems(items, { domain: "docs", status: "active", tags: ["release"] })).toEqual({
    items: [
      { id: "beta", title: "Beta", domain: "docs", status: "active", tags: ["release", "team"] },
      { id: "delta", title: "Delta", domain: "docs", status: "active", tags: ["release", "team"] },
    ],
    page: 1,
    pageSize: 2,
    total: 2,
    error: null,
  });
});

test("filters before pagination and treats duplicate tags as one constraint", () => {
  expect(queryItems(items, { domain: "docs", status: "active", tags: ["team", "team"], page: 2 })).toEqual({
    items: [
      { id: "epsilon", title: "Epsilon", domain: "docs", status: "active", tags: ["team"] },
    ],
    page: 2,
    pageSize: 2,
    total: 3,
    error: null,
  });
});

test("distinguishes invalid filters from out-of-range pages", () => {
  const unknownDomain = queryItems(items, { domain: "unknown" });
  const invalidPage = queryItems(items, { page: 0 });
  const outOfRange = queryItems(items, { domain: "guides", page: 2 });

  expect(unknownDomain.error?.code).toBe("invalid-query");
  expect(invalidPage.error?.code).toBe("invalid-query");
  expect(outOfRange).toEqual({
    items: [],
    page: 2,
    pageSize: 2,
    total: 1,
    error: { code: "out-of-range", message: "Page is outside the result set" },
  });
});

test("does not depend on item order or mutate the input", () => {
  const first = structuredClone(items);
  const second = [...first].reverse();
  const before = structuredClone(first);
  const query = { domain: "docs", status: "active", tags: ["team"] };

  expect(queryItems(first, query)).toEqual(queryItems(second, query));
  expect(first).toEqual(before);
});
