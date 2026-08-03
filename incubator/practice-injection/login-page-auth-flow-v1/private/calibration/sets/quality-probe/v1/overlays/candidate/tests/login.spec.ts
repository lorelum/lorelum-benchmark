import { expect, test, type Page } from "@playwright/test";

const VALID_EMAIL = "ops@meridian.internal";
const VALID_PASSWORD = "Orion#2026";

async function stubSessionApi(page: Page): Promise<void> {
  await page.route("**/api/session", async (route) => {
    const payload = route.request().postDataJSON() as { email?: string; password?: string };
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (payload.email === VALID_EMAIL && payload.password === VALID_PASSWORD) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: { id: "u-1", display_name: "系统管理员", role: "admin" } }),
      });
    } else {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ code: "invalid_credentials", message: "邮箱或密码错误" }),
      });
    }
  });
}

test("正确账号登录后显示当前登录用户", async ({ page }) => {
  await stubSessionApi(page);
  await page.goto("/");
  await page.getByLabel("邮箱").fill(VALID_EMAIL);
  await page.getByLabel("密码").fill(VALID_PASSWORD);
  await page.getByRole("button", { name: "登录" }).click();

  await expect(page.getByRole("status")).toHaveText("欢迎，系统管理员");
});

test("错误账号显示通用错误，请求期间禁用表单且只发起一次请求", async ({ page }) => {
  await stubSessionApi(page);

  await page.goto("/");
  await page.getByLabel("邮箱").fill(VALID_EMAIL);
  await page.getByLabel("密码").fill("wrong-password");

  const submit = page.getByRole("button", { name: "登录" });
  const [firstSessionRequest] = await Promise.all([
    page.waitForRequest((request) => new URL(request.url()).pathname === "/api/session"),
    submit.click(),
  ]);

  await expect(submit).toBeDisabled();
  await expect(page.getByLabel("邮箱")).toBeDisabled();
  await expect(page.getByLabel("密码")).toBeDisabled();

  // 请求进行中再次触发表单提交：有防重复提交时应被忽略
  await page.locator("form").evaluate((form) => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await expect(page.getByRole("alert")).toHaveText("邮箱或密码错误");

  const extraRequest = await page.waitForRequest(
    (request) => new URL(request.url()).pathname === "/api/session" && request !== firstSessionRequest,
    { timeout: 800 },
  ).catch(() => null);
  expect(extraRequest).toBeNull();
});
