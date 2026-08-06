import { expect, test, type Page } from "@playwright/test";

async function stubProfileApi(page: Page): Promise<void> {
  await page.route("**/api/profile", async (route) => {
    const request = route.request();
    await new Promise((resolve) => setTimeout(resolve, 120));
    if (request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ display_name: "Ari" }) });
      return;
    }
    const payload = request.postDataJSON() as { display_name?: string };
    if (payload.display_name === "已使用") {
      await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ code: "display_name_taken" }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ display_name: payload.display_name }) });
  });
}

test("加载资料并保存显示名", async ({ page }) => {
  await stubProfileApi(page);
  await page.goto("/");
  const name = page.getByLabel("显示名");
  await expect(name).toHaveValue("Ari");
  await name.fill("Mina");
  await page.getByRole("button", { name: "保存" }).click();

  await expect(page.getByRole("status")).toHaveText("资料已保存");
});

test("校验显示名、显示冲突且保存期间只发起一次请求", async ({ page }) => {
  await stubProfileApi(page);

  await page.goto("/");
  const name = page.getByLabel("显示名");
  await expect(name).toHaveValue("Ari");
  await name.fill("");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByRole("alert")).toHaveText("显示名不能为空");

  await name.fill("已使用");

  const submit = page.getByRole("button", { name: "保存" });
  const [firstSaveRequest] = await Promise.all([
    page.waitForRequest((request) => new URL(request.url()).pathname === "/api/profile" && request.method() === "PUT"),
    submit.click(),
  ]);

  await expect(submit).toBeDisabled();
  await expect(name).toBeDisabled();

  await expect(page.getByRole("alert")).toHaveText("名称已被使用");

  // 请求进行中再次触发表单提交：有防重复提交时应被忽略
  await page.locator("form").evaluate((form) => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  const extraRequest = await page.waitForRequest(
    (request) => new URL(request.url()).pathname === "/api/profile" && request.method() === "PUT" && request !== firstSaveRequest,
    { timeout: 800 },
  ).catch(() => null);
  expect(extraRequest).toBeNull();
});