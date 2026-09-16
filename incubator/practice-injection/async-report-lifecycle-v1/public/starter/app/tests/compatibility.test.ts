import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "bun:test";
import { createReport, pauseReport } from "../src/report-service";
import { ReportStore } from "../src/store";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

test("legacy writes preserve v2 extension fields during rollback", async () => {
  const root = await mkdtemp(join(tmpdir(), "async-report-compatibility-"));
  roots.push(root);
  const store = new ReportStore(join(root, "reports"));
  await createReport(store, 2, "compatibility");
  const before = JSON.parse(await readFile(store.path("compatibility"), "utf8")) as Record<string, unknown>;
  expect(before.writer_version).toBe("v2");

  await pauseReport(store, 1, "compatibility");
  const after = JSON.parse(await readFile(store.path("compatibility"), "utf8")) as Record<string, unknown>;
  expect(after.writer_version).toBe("v2");
  expect(after.checkpoint_metadata).toEqual({ reason: "pause-requested", segment: 0 });
});
