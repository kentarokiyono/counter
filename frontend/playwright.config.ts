import { defineConfig, devices } from "@playwright/test";

/**
 * 画面の自動テスト。偽のバックエンド（backend/tests/e2e_server.py）と本番ビルドのフロントを起動して操作する。
 *   npm run build && npm run e2e
 * PYTHON にバックエンド用の python を指定できる（既定: python3）。
 */
const python = process.env.PYTHON ?? "python3";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "off",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    // 手元に入っている別版のブラウザを使う場合（例: PW_CHROMIUM=/opt/pw-browsers/chromium）
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  projects: [
    { name: "pc", use: { viewport: { width: 1280, height: 860 } }, testIgnore: /phone\.spec\.ts/ },
    { name: "phone", use: { ...devices["iPhone 13"], browserName: "chromium" }, testMatch: /phone\.spec\.ts/ },
  ],
  webServer: [
    {
      command: `${python} ../backend/tests/e2e_server.py`,
      url: "http://127.0.0.1:8000/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: "npx next start -p 3000",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
