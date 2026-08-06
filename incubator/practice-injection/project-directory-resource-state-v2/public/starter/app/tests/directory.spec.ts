import { expect, test, type Page } from "@playwright/test";

async function stubProjectsApi(page: Page): Promise<void> {
  let outageAttempts = 0;
  await page.route("**/api/projects*", async (route) => {
    const url = new URL(route.request().url());
    const query = url.searchParams.get("q") ?? "";
    await new Promise((resolve) => setTimeout(resolve, 120));
    const projects = [{ id: "orbit", name: "Orbit" }, { id: "zen", name: "Zen" }];
    if (query === "outage" && outageAttempts++ === 0) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "unavailable" }) });
      return;
    }
    const filtered = query === "outage" ? projects : projects.filter((project) => project.name.toLowerCase().includes(query.toLowerCase()));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(filtered) });
  });
}

test("搜索、空结果和重试恢复项目目录", async ({ page }) => {
  await stubProjectsApi(page);
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