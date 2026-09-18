import { afterEach, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { TestApp, responseJson } from "./harness";

let app: TestApp | undefined;
afterEach(async () => {
  await app?.dispose();
  app = undefined;
});

describe("async report evaluator harness", () => {
  test("starts a copied public starter and exposes its API", async () => {
    const appRoot = resolve(import.meta.dirname, "../../../../async-report-lifecycle-v1/public/starter/app");
    app = await TestApp.create(appRoot);
    const server = await app.startServer();
    try {
      const created = await app.request("POST", "/api/v1/reports", { id: "harness-check" }, server.baseUrl);
      expect(created.status).toBe(201);
      expect(responseJson(created)).toMatchObject({ id: "harness-check", status: "queued" });
    } finally {
      await server.stop();
    }
  });
});
