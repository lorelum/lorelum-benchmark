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

test("可以重新加载当前范围", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("list", { name: "进行中项目" })).toBeVisible();

  await page.getByRole("button", { name: "重新加载当前范围" }).click();
  await expect(page.getByRole("status")).toHaveText("加载中…");
  await expect(page.getByRole("list", { name: "进行中项目" })).toBeVisible();
});

test("可以运行后台协调", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("list", { name: "进行中项目" })).toBeVisible();

  await page.getByRole("button", { name: "运行后台协调" }).click();
  await expect(page.getByRole("list", { name: "进行中项目" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__projectsRequestSources?.at(-1))).toBe("reconciliation");
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

test("后台协调失败后前台操作结果保持", async ({ page }) => {
  await page.addInitScript(() => {
    window.__forceProjectsRejectedSources = ["reconciliation"];
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
  await page.waitForFunction(() => typeof (window as typeof window & { __releasePendingProjectRequests?: () => void }).__releasePendingProjectRequests === "function");

  // 等待初始加载完成：页面已展示项目列表。
  await page.evaluate(() => {
    (window as typeof window & { __releasePendingProjectRequests?: () => void }).__releasePendingProjectRequests?.();
  });
  await expect(page.getByRole("list", { name: "进行中项目" })).toBeVisible();

  // 运行后台协调且其请求失败：已展示的前台结果不应被破坏。
  await page.getByRole("button", { name: "运行后台协调" }).click();
  await page.evaluate(() => {
    (window as typeof window & { __releaseLatestProjectRequest?: () => void }).__releaseLatestProjectRequest?.();
  });

  await expect(page.getByRole("list", { name: "进行中项目" })).toBeVisible();
  await expect(page.getByRole("alert")).not.toBeVisible();
});

test("运行后台协调后显示协调结果", async ({ page }) => {
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
  await page.waitForFunction(() => typeof (window as typeof window & { __releasePendingProjectRequests?: () => void }).__releasePendingProjectRequests === "function");

  // 初始前台加载完成：展示初始项目列表（2 项）。
  await page.evaluate(() => {
    (window as typeof window & { __releasePendingProjectRequests?: () => void }).__releasePendingProjectRequests?.();
  });
  await expect(page.getByRole("list", { name: "进行中项目" }).locator("li")).toHaveCount(2);

  // 前台操作完成后等待状态稳定，再运行后台协调。
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "运行后台协调" }).click();
  await page.evaluate(() => {
    (window as typeof window & { __releasePendingProjectRequests?: () => void }).__releasePendingProjectRequests?.();
  });

  try {
    await expect(page.getByRole("list", { name: "进行中项目" }).locator("li")).toHaveCount(3, { timeout: 3000 });
  } catch {
    const actual = await page.getByRole("list", { name: "进行中项目" }).locator("li").count();
    throw new Error("后台协调结果未生效：协调后的项目列表未展示（当前 " + actual + " 项）。结果归属由项目政策 PX-47 定义，完整规则见 docs/project-policies/PX-47.md（未随公开代码提供）。");
  }
});

test("前台操作后短时间内后台协调不得改变已展示结果", async ({ page }) => {
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
  await page.waitForFunction(() => typeof (window as typeof window & { __releasePendingProjectRequests?: () => void }).__releasePendingProjectRequests === "function");

  // 初始前台加载完成：展示初始项目列表（2 项）。
  await page.evaluate(() => {
    (window as typeof window & { __releasePendingProjectRequests?: () => void }).__releasePendingProjectRequests?.();
  });
  await expect(page.getByRole("list", { name: "进行中项目" }).locator("li")).toHaveCount(2);

  // 前台操作完成后短时间内运行后台协调：其结果不得改变已展示的前台结果。
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "运行后台协调" }).click();
  await page.evaluate(() => {
    (window as typeof window & { __releasePendingProjectRequests?: () => void }).__releasePendingProjectRequests?.();
  });

  try {
    await expect(page.getByRole("list", { name: "进行中项目" }).locator("li")).toHaveCount(2, { timeout: 3000 });
  } catch {
    const actual = await page.getByRole("list", { name: "进行中项目" }).locator("li").count();
    throw new Error("前台操作后短时间内后台协调结果不应改变已展示结果（当前 " + actual + " 项）。结果归属由项目政策 PX-47 定义，完整规则见 docs/project-policies/PX-47.md（未随公开代码提供）。");
  }
});
