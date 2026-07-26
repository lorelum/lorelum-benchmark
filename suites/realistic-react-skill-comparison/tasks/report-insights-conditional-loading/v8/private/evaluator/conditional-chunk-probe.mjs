import { spawn } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [appRoot, chunk] = process.argv.slice(2);
if (!appRoot || !chunk) throw new Error("Usage: node conditional-chunk-probe.mjs <app-root> <chunk>");
const port = 3102;
const url = `http://127.0.0.1:${port}/reports/adoption`;
const api = "/api/reports/adoption/insights";
const privateMarker = "Internal report insights payload";
const wait = async () => { for (let i = 0; i < 100; i += 1) { try { if ((await fetch(url)).ok) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 100)); } throw new Error("Next production server did not become ready"); };
const server = spawn(process.execPath, ["./node_modules/next/dist/bin/next", "start", "-p", String(port)], { cwd: appRoot, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" }, stdio: "ignore" });
try {
  await wait();
  const { chromium } = await import(pathToFileURL(join(appRoot, "node_modules", "playwright", "index.mjs")).href);
  const browser = await chromium.launch({ headless: true });
  try {
    const authorizedContext = await browser.newContext();
    const authorizedPage = await authorizedContext.newPage();
    const authorizedRequests = [];
    authorizedPage.on("request", (request) => authorizedRequests.push(request.url()));
    await authorizedPage.goto(url);
    await authorizedPage.waitForLoadState("networkidle");
    const before = { chunk: authorizedRequests.some((value) => value.includes(chunk)), api: authorizedRequests.filter((value) => value.includes(api)).length };
    await authorizedPage.getByRole("button", { name: "Open insights" }).click();
    await authorizedPage.getByTestId("insights-ready").waitFor();
    const first = { chunk: authorizedRequests.some((value) => value.includes(chunk)), api: authorizedRequests.filter((value) => value.includes(api)).length };
    await authorizedPage.getByRole("button", { name: "Close insights" }).click();
    await authorizedPage.getByRole("button", { name: "Open insights" }).click();
    await authorizedPage.getByTestId("insights-ready").waitFor();
    const reopenApi = authorizedRequests.filter((value) => value.includes(api)).length - first.api;
    await authorizedContext.close();

    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    const guestRequests = [];
    const guestApiPayloads = [];
    guestPage.on("request", (request) => guestRequests.push(request.url()));
    guestPage.on("response", async (response) => {
      if (response.url().includes(api)) guestApiPayloads.push(await response.text());
    });
    const guestResponse = await guestPage.goto(`${url}?as=guest`);
    await guestPage.waitForLoadState("networkidle");
    const guestDocument = guestResponse ? await guestResponse.text() : "";
    const guestHtml = await guestPage.content();
    console.log(JSON.stringify({
      before,
      first,
      reopenApi,
      guestChunk: guestRequests.some((value) => value.includes(chunk)),
      guestApi: guestRequests.filter((value) => value.includes(api)).length,
      guestPayloadLeaked: guestApiPayloads.some((payload) => payload.includes(privateMarker)),
      guestDocumentLeaked: guestDocument.includes(privateMarker) || guestHtml.includes(privateMarker)
    }));
    await guestContext.close();
  } finally { await browser.close(); }
} finally { try { process.kill(server.pid, "SIGTERM"); } catch {} }
