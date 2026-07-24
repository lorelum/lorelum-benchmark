import { spawn } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [appRoot, chunk] = process.argv.slice(2);
if (!appRoot || !chunk) throw new Error("Usage: node conditional-chunk-probe.mjs <app-root> <chunk>");

const port = 3102;
const reportUrl = `http://127.0.0.1:${port}/reports/adoption`;

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(reportUrl)).ok) return;
    } catch {}
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error("Next production server did not become ready");
}

async function stopServer(pid) {
  if (process.platform === "win32") {
    await new Promise((resolvePromise) => {
      const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
      killer.on("exit", resolvePromise);
      killer.on("error", resolvePromise);
    });
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {}
}

const server = spawn(process.execPath, ["./node_modules/next/dist/bin/next", "start", "-p", String(port)], {
  cwd: appRoot,
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  stdio: "ignore",
});

try {
  await waitForServer();
  const playwrightPath = join(appRoot, "node_modules", "playwright", "index.mjs");
  const { chromium } = await import(pathToFileURL(playwrightPath).href);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const requests = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.goto(reportUrl);
    await page.waitForLoadState("networkidle");
    const beforeClick = requests.some((url) => url.includes(chunk));
    await page.getByRole("button", { name: "Open insights" }).click();
    await page.getByTestId("insights-ready").waitFor();
    const afterClick = requests.some((url) => url.includes(chunk));
    console.log(JSON.stringify({ beforeClick, afterClick }));
  } finally {
    await browser.close();
  }
} finally {
  await stopServer(server.pid);
}
