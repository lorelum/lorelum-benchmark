import { expect, test } from "@playwright/test";

test("搜索、空结果和重试恢复项目目录", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Orbit")).toBeVisible();
  await page.getByLabel("搜索项目").fill("zen");
  await page.getByRole("button", { name: "搜索" }).click();
  await expect(page.getByText("Zen")).toBeVisible();
  await page.getByLabel("搜索项目").fill("missing");
  await page.getByRole("button", { name: "搜索" }).click();
  await expect(page.getByText("没有匹配的项目")).toBeVisible();
  await page.getByLabel("搜索项目").fill("outage");
  await page.getByRole("button", { name: "搜索" }).click();
  await expect(page.getByRole("alert")).toHaveText("暂时无法加载项目");
  await page.getByRole("button", { name: "重试" }).click();
  await expect(page.getByText("Orbit")).toBeVisible();
});
