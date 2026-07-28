import { defineConfig, devices } from "@playwright/test";

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
if (!externalBaseUrl) throw new Error("PLAYWRIGHT_BASE_URL must be provided by the calibration runtime");

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  use: {
    baseURL: externalBaseUrl,
    trace: "retain-on-failure",
  },
  webServer: undefined,
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});