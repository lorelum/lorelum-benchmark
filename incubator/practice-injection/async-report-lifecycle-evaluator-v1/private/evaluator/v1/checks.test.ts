import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { materializeFixture, type MaterializedFixture } from "./calibration/materialize";
import { checks } from "./checks";
import { runCheck } from "./evaluate";
import { loadEvaluatorIdentity } from "./identity";

const fixtures = new Map<string, MaterializedFixture>();

beforeAll(async () => {
  const identity = await loadEvaluatorIdentity();
  const fixtureIds = [
    "reference",
    ...checks.map((check) => `negative/${check.id}`),
  ];
  for (const fixtureId of fixtureIds) {
    fixtures.set(fixtureId, await materializeFixture(identity, fixtureId));
  }
});

afterAll(async () => {
  await Promise.all([...fixtures.values()].map((fixture) => fixture.dispose()));
});

describe("async report evaluator checks", () => {
  for (const check of checks) {
    test(`${check.id} distinguishes pass, targeted failure, and indeterminate`, async () => {
      const reference = fixtures.get("reference");
      const negative = fixtures.get(`negative/${check.id}`);
      if (!reference || !negative) throw new Error(`fixture setup failed for ${check.id}`);

      expect(await runCheck(check, reference.appRoot)).toEqual({ id: check.id, status: "pass" });

      const failed = await runCheck(check, negative.appRoot);
      expect(failed.id).toBe(check.id);
      expect(failed.status).toBe("fail");
      expect(failed.reason).toMatch(/^[a-z0-9][a-z0-9-]*$/);

      expect(await runCheck(check, join(import.meta.dirname, "__missing_app_root__"))).toEqual({
        id: check.id,
        status: "indeterminate",
        reason: "app-copy-failed",
      });
    }, 30_000);
  }
});
