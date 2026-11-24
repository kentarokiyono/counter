import { expect, test } from "@playwright/test";

test("初回だけ「ようこそ」が出て、閉じると次からは出ない", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("ようこそ、Masayaさん")).toBeVisible();
  while (await page.getByRole("button", { name: /次へ|あとで/ }).first().isVisible()) {
    await page.getByRole("button", { name: /次へ|あとで/ }).first().click();
  }
  await page.getByRole("button", { name: "はじめる" }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: /、Masayaさん$/ })).toBeVisible();
  await expect(page.getByText("ようこそ、Masayaさん")).toHaveCount(0);
});
