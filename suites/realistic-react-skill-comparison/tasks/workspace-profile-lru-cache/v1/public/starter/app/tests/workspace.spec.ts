import { expect, test } from "@playwright/test";

test("workspace profile remains usable", async ({ page }) => {
  await page.goto("/workspaces/atlas");
  await expect(page.getByRole("heading", { name: "Atlas" })).toBeVisible();
  await expect(page.getByLabel("Workspace profile")).toContainText("pro plan");
  await expect(page.getByLabel("Workspace profile")).toContainText("us-east");
});

test("team directory preserves filtering and selection", async ({ page }) => {
  await page.goto("/team");
  await page.getByLabel("Filter").fill("lin");
  await expect(page.getByRole("button", { name: "Lin" })).toBeVisible();
  await page.getByRole("button", { name: "Lin" }).click();
  await expect(page.getByTestId("selected-member")).toHaveText("Selected: m2");
});

test("report insights remain an explicit authorized interaction", async ({ page }) => {
  await page.goto("/reports/adoption");
  await page.getByRole("button", { name: "Open insights" }).click();
  await expect(page.getByTestId("insights-ready")).toContainText("adoption");
  await page.goto("/reports/adoption?as=guest");
  await expect(page.getByTestId("insights-unavailable")).toBeVisible();
});
