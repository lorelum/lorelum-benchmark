import { expect, test } from "@playwright/test";

test("加载完成后展示进行中项目", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("status")).toHaveText("加载中…");
  await expect(page.getByRole("heading", { name: "项目概览" })).toBeVisible();

  const items = page.getByRole("list", { name: "进行中项目" }).locator("li");
  await expect(items).toHaveCount(2);
  await expect(items.first()).toContainText("迁移至 Vite 7");
  await expect(items.first()).toContainText("进行中");
});

test("当前范围服务不可用时展示错误提示", async ({ page }) => {
  await page.addInitScript(() => {
    window.__forceProjectsUnavailableScopes = ["active"];
  });
  await page.goto("/");

  await expect(page.getByRole("alert")).toHaveText("项目列表暂时不可用");
});

test("范围切换后保留当前范围内容", async ({ page }) => {
  await page.addInitScript(() => {
    const original = window.setTimeout.bind(window);
    const delayed: Array<() => void> = [];
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      if (timeout === 300 && typeof handler === "function") {
        delayed.push(() => handler(...args));
        return 0 as unknown as number;
      }
      return original(handler, timeout, ...args);
    }) as typeof window.setTimeout;
    (window as typeof window & { __releaseLatestProjectRequest?: () => void }).__releaseLatestProjectRequest = () => {
      delayed.pop()?.();
    };
    (window as typeof window & { __releasePendingProjectRequests?: () => void }).__releasePendingProjectRequests = () => {
      for (const release of delayed.splice(0)) release();
    };
  });
  await page.goto("/");
  await page.waitForFunction(() => typeof (window as typeof window & { __releaseLatestProjectRequest?: () => void }).__releaseLatestProjectRequest === "function");
  await page.getByRole("button", { name: "已归档项目" }).click();
  await page.evaluate(() => {
    (window as typeof window & { __releaseLatestProjectRequest?: () => void }).__releaseLatestProjectRequest?.();
  });
  await expect(page.getByRole("list", { name: "已归档项目" })).toContainText("遗留 API 下线");
  await page.evaluate(() => {
    (window as typeof window & { __releasePendingProjectRequests?: () => void }).__releasePendingProjectRequests?.();
  });
  await expect(page.getByRole("list", { name: "已归档项目" })).toContainText("遗留 API 下线");
});
