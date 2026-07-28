import { expect, test } from "@playwright/test";

test("加载资料并保存显示名", async ({ page }) => {
  await page.goto("/");
  const name = page.getByLabel("显示名");
  await expect(name).toHaveValue("Ari");
  await name.fill("Mina");
  await page.getByRole("button", { name: "保存" }).click();

  await expect(page.getByRole("status")).toHaveText("资料已保存");
});

test("校验显示名、显示冲突且保存期间只发起一次请求", async ({ page }) => {
  await page.goto("/");
  const name = page.getByLabel("显示名");
  await expect(name).toHaveValue("Ari");
  await name.fill("");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByRole("alert")).toHaveText("显示名不能为空");

  await name.fill("已使用");

  const submit = page.getByRole("button", { name: "保存" });
  await submit.click();
  await expect(submit).toBeDisabled();
  await expect(name).toBeDisabled();

  await expect(page.getByRole("alert")).toHaveText("名称已被使用");
  await expect.poll(() => page.evaluate(() => window.__profileRequestCount)).toBe(1);
});
