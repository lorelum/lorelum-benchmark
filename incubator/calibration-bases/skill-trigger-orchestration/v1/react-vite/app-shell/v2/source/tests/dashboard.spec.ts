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

test("快速离开页面后不再处理旧请求响应", async ({ page }) => {
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
    (window as typeof window & { __navigationCompletedAfterLeave?: number }).__navigationCompletedAfterLeave = 0;
    window.__projectResponseHandled = () => {
      (window as typeof window & { __navigationCompletedAfterLeave?: number }).__navigationCompletedAfterLeave! += 1;
    };
    (window as typeof window & { __releaseProjectRequests?: () => void }).__releaseProjectRequests = () => {
      for (const release of delayed.splice(0)) release();
    };
  });
  await page.goto("/");
  await page.waitForFunction(() => typeof (window as typeof window & { __releaseProjectRequests?: () => void }).__releaseProjectRequests === "function");
  await page.evaluate(() => {
    window.__unmountProjectOverview?.();
    (window as typeof window & { __releaseProjectRequests?: () => void }).__releaseProjectRequests?.();
  });
  await page.waitForTimeout(50);
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __navigationCompletedAfterLeave?: number }).__navigationCompletedAfterLeave)).toBe(0);
});
