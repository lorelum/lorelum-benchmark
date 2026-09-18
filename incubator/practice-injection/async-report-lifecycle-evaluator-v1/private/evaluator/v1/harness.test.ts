import { afterEach, describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
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

  test("does not expose condition metadata to server or worker processes", async () => {
    const appRoot = resolve(import.meta.dirname, "../../../../async-report-lifecycle-v1/public/starter/app");
    app = await TestApp.create(appRoot);
    await writeFile(
      resolve(app.appRoot, "src", "server.ts"),
      [
        'const server = Bun.serve({ port: Number(process.env.REPORT_PORT ?? "0"), hostname: "127.0.0.1", fetch() {',
        "  return Response.json({",
        '    condition: process.env.PRACTICE_CONDITION ?? null,',
        '    deliveryNode: process.env.DELIVERY_NODE_ID ?? null,',
        '    practiceId: process.env.PRACTICE_ID ?? null,',
        '    packRef: process.env.PACK_REF ?? null,',
        "  });",
        "} });",
        "console.log(JSON.stringify({ port: server.port }));",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      resolve(app.appRoot, "src", "worker.ts"),
      [
        "console.log(JSON.stringify({",
        '  condition: process.env.PRACTICE_CONDITION ?? null,',
        '  deliveryNode: process.env.DELIVERY_NODE_ID ?? null,',
        '  practiceId: process.env.PRACTICE_ID ?? null,',
        '  packRef: process.env.PACK_REF ?? null,',
        "}));",
        "",
      ].join("\n"),
      "utf8",
    );

    const previous = {
      PRACTICE_CONDITION: process.env.PRACTICE_CONDITION,
      DELIVERY_NODE_ID: process.env.DELIVERY_NODE_ID,
      PRACTICE_ID: process.env.PRACTICE_ID,
      PACK_REF: process.env.PACK_REF,
    };
    process.env.PRACTICE_CONDITION = "practice-timing";
    process.env.DELIVERY_NODE_ID = "after-plan";
    process.env.PRACTICE_ID = "async-report-lifecycle";
    process.env.PACK_REF = "agentic-coding@0.4.0";
    try {
      const server = await app.startServer();
      try {
        const response = await app.request("GET", "/", undefined, server.baseUrl);
        expect(responseJson(response)).toEqual({
          condition: null,
          deliveryNode: null,
          practiceId: null,
          packRef: null,
        });
      } finally {
        await server.stop();
      }

      const worker = await app.runWorker([]);
      expect(worker.exitCode).toBe(0);
      expect(worker.value).toEqual({
        condition: null,
        deliveryNode: null,
        practiceId: null,
        packRef: null,
      });
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }, 30_000);
});
