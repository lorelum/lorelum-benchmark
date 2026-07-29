import { expect, test } from "@playwright/test";

test("加载完成后展示项目列表", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("status")).toHaveText("加载中…");
  await expect(page.getByRole("heading", { name: "项目概览" })).toBeVisible();

  const items = page.locator("ul li");
  await expect(items).toHaveCount(3);
  await expect(items.first()).toContainText("迁移至 Vite 7");
  await expect(items.first()).toContainText("进行中");
  await expect(items.last()).toContainText("已归档");
});

test("服务不可用时展示错误提示", async ({ page }) => {
  await page.addInitScript(() => {
    window.__forceProjectsUnavailable = true;
  });
  await page.goto("/");

  await expect(page.getByRole("alert")).toHaveText("项目列表暂时不可用");
});
