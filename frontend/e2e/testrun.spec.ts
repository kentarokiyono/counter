import { expect, test } from "./fixtures";

const RUN = Date.now().toString(36).slice(-4);

test("活動ログ: 区分ごとの作業時間（開始・終了・後から記録・修正）・記録・まとめの書き出し", async ({ page }) => {
  const name = `E2E活動${RUN}${test.info().repeatEachIndex}`;
  await page.goto("/test-runs");
  await page.getByRole("button", { name: "新しい活動ログ" }).click();
  await page.getByPlaceholder("例: 道の駅なみえ ブース出展").fill(name);
  await page.getByRole("button", { name: "作成", exact: true }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();

  // 区分ごとに作業を開始・終了
  const body = page.getByRole("region", { name: "準備" });
  await body.getByLabel("準備の作業内容").fill("テント設営");
  await body.getByRole("button", { name: "開始" }).click();
  await expect(body.getByText("テント設営")).toBeVisible();
  await expect(page.getByRole("radio", { name: "作業時間（1）" })).toBeVisible();
  const elec = page.getByRole("region", { name: "現地対応" });
  await elec.getByLabel("現地対応の作業内容").fill("案内");
  await elec.getByRole("button", { name: "開始" }).click();
  await expect(page.getByRole("radio", { name: "作業時間（2）" })).toBeVisible();
  await body.getByRole("button", { name: "テント設営を終了" }).click();
  await expect(body.getByText("作業中のものはありません")).toBeVisible();

  // 押し忘れを後から記録
  await page.getByRole("button", { name: "＋ 後から記録" }).click();
  const sheet = page.getByRole("dialog", { name: "作業を後から記録" });
  await sheet.getByRole("radio", { name: "撤収", exact: true }).click();
  await sheet.getByLabel("作業内容").fill("片付け");
  const d = new Date(Date.now() - 2 * 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  const local = (x: Date) => `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T${p(x.getHours())}:${p(x.getMinutes())}`;
  await sheet.getByLabel("開始").fill(local(d));
  await sheet.getByLabel("終了").fill(local(new Date(d.getTime() + 45 * 60_000)));
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByRole("region", { name: "撤収" }).getByText("45:00", { exact: true })).toBeVisible();

  // 一覧から開いて時刻を修正
  await page.getByRole("button", { name: /片付け/ }).click();
  await page.getByRole("dialog", { name: "作業を修正" }).getByLabel("終了").fill(local(new Date(d.getTime() + 60 * 60_000)));
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByRole("region", { name: "撤収" }).getByText("1:00:00")).toBeVisible();

  // 記録（操作は自動で残る）
  await page.getByRole("radio", { name: "記録" }).click();
  await page.getByLabel("メモを記録").fill("来場者が増えてきた");
  await page.getByRole("button", { name: "記録", exact: true }).click();
  await expect(page.getByText("来場者が増えてきた")).toBeVisible();
  await expect(page.getByText("準備: テント設営 終了")).toBeVisible();
  await expect(page.getByText("撤収: 片付け（後から記録）")).toBeVisible();

  // まとめの書き出し
  await page.getByRole("radio", { name: "まとめ" }).click();
  await expect(page.getByText("| 撤収 | 1:00:00 | 1 |")).toBeVisible();
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    w.showSaveFilePicker = async (opts: { suggestedName: string }) => ({
      createWritable: async () => ({
        write: async (b: Blob) => {
          w.__saved = { name: opts.suggestedName, text: await b.text() };
        },
        close: async () => {},
      }),
    });
  });
  await page.getByText("まとめを保存（Markdown）").click();
  await expect(page.getByText("保存しました")).toBeVisible();
  const saved = (await page.evaluate(() => (window as unknown as { __saved: { name: string; text: string } }).__saved))!;
  expect(saved.name).toBe(`${name}_レポート.md`);
  expect(saved.text).toContain("| 撤収 | 1:00:00 | 1 |");
  expect(saved.text).toContain("テント設営");

  await page.getByRole("link", { name: "活動ログ" }).first().click();
  await expect(page).toHaveURL(/\/test-runs$/);
  await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
});
