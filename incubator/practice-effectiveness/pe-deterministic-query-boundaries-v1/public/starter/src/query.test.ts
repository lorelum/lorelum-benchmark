import { expect, test } from "bun:test";
import items from "../fixtures/items.json";
import { queryItems } from "./query.ts";

test("keeps the compatible first-page response for valid local items", () => {
  expect(queryItems(items, { page: 1 })).toEqual({
    items,
    page: 1,
    pageSize: 2,
    total: 2,
    error: null,
  });
});
