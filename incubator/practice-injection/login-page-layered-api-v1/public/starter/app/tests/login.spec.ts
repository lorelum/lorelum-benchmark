import { expect, test } from "@playwright/test";

test("正确凭证在原页面显示欢迎状态", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("邮箱").fill("demo@example.com");
  await page.getByLabel("密码").fill("password123");
  await page.getByRole("button", { name: "登录" }).click();

  await expect(page.getByRole("status")).toHaveText("欢迎，演示用户");
});

test("认证失败显示通用错误且提交期间只发起一次请求", async ({ page }) => {
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
  await expect.poll(() => page.evaluate(() => window.__loginRequestCount)).toBe(1);
});
