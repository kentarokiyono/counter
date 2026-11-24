import { expect, test } from "./fixtures";

test("スマホ: 下部タブで移動でき、その他メニューが開く", async ({ page }) => {
  await page.goto("/");
  const tabs = page.getByRole("navigation", { name: "タブ" });
  await tabs.getByRole("link", { name: "タスク" }).click();
  await expect(page.getByRole("heading", { name: "タスク" })).toBeVisible();
  await tabs.getByRole("button", { name: "その他" }).click();
  await expect(page.getByRole("dialog", { name: "その他" })).toBeVisible();
  await page.getByRole("dialog", { name: "その他" }).getByRole("link", { name: "活動ログ" }).click();
  await expect(page.getByRole("heading", { name: "活動ログ" })).toBeVisible();
});
