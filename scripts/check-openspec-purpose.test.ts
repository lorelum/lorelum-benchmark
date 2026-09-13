import { describe, expect, test } from "bun:test";
import { purposeFailures } from "./check-openspec-purpose";

describe("OpenSpec Purpose guard", () => {
  test("passes when no stable spec changed", () => {
    expect(purposeFailures([])).toEqual([]);
  });

  test("accepts a changed stable spec with a real Purpose", () => {
    expect(purposeFailures([{
      path: "openspec/specs/example/spec.md",
      content: "# example Specification\n\n## Purpose\n\nDefine a reusable example contract.\n\n## Requirements\n"
    }])).toEqual([]);
  });

  test("rejects a changed stable spec with the generated archive placeholder", () => {
    expect(purposeFailures([{
      path: "openspec/specs/example/spec.md",
      content: "# example Specification\n\n## Purpose\nTBD - created by archiving change example. Update Purpose after archive.\n\n## Requirements\n"
    }])).toEqual(["openspec/specs/example/spec.md: Purpose still uses the generated archive placeholder"]);
  });
});
