import { expect, test } from "@playwright/test";

test("workspace dashboard remains usable", async ({ page }) => {
  await page.goto("/workspaces/atlas");
  await expect(page.getByRole("heading", { name: "Atlas" })).toBeVisible();
  await expect(page.getByLabel("Quota")).toContainText("32 of 100 seats used");
  await expect(page.getByLabel("Recent projects")).toContainText("Launch");
});

test("team directory preserves filtering and selection", async ({ page }) => {
  await page.goto("/team");
  await page.getByLabel("Filter").fill("lin");
  await expect(page.getByRole("button", { name: "Lin" })).toBeVisible();
  await page.getByRole("button", { name: "Lin" }).click();
  await expect(page.getByTestId("selected-member")).toHaveText("Selected: m2");
});
