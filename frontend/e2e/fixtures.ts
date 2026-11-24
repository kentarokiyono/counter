import { test as base } from "@playwright/test";

/** 初回の「ようこそ」を出さない（専用のテスト以外） */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => localStorage.setItem("toloc_welcomed_v1:masaya@ecs.osaka-u.ac.jp", "1"));
    await use(page);
  },
});
export { expect } from "@playwright/test";
