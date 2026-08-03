import { expect, test } from "@playwright/test";

test("正确账号在原页面显示当前登录用户", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("邮箱").fill("admin@example.com");
  await page.getByLabel("密码").fill("admin123");
  await page.getByRole("button", { name: "登录" }).click();

  await expect(page.getByRole("status")).toHaveText("欢迎，系统管理员");
});

test("错误账号显示通用错误且提交期间只发起一次请求", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("邮箱").fill("wrong@example.com");
  await page.getByLabel("密码").fill("wrong-password");

  const submit = page.getByRole("button", { name: "登录" });
  await submit.click();
  await expect(submit).toBeDisabled();
  await expect(page.getByLabel("邮箱")).toBeDisabled();
  await expect(page.getByLabel("密码")).toBeDisabled();

  await page.locator("form").evaluate((form) => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await expect(page.getByRole("alert")).toHaveText("邮箱或密码错误");
  await expect.poll(() => page.evaluate(() => window.__sessionRequestCount)).toBe(1);
});