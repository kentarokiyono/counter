import { expect, test } from "./fixtures";

const RUN = Date.now().toString(36).slice(-4);

test("シール集計: 色を選んで都道府県を数え、取り消し・集計表・書き出しができる", async ({ page }) => {
  const name = `E2E来場者調査${RUN}${test.info().repeatEachIndex}`;
  await page.goto("/stickers");
  await page.getByRole("button", { name: "新しい集計" }).click();
  const sheet = page.getByRole("dialog", { name: "新しいシール集計" });
  await sheet.getByPlaceholder("例: 道の駅なみえ 来場者調査").fill(name);
  // 色の意味を付け、色を1つ足す
  await sheet.getByLabel("赤の意味").fill("10代");
  await sheet.getByRole("button", { name: "紫" }).click();
  await sheet.getByLabel("紫の意味").fill("海外の方");
  await page.getByRole("button", { name: "作成", exact: true }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();

  const colors = page.getByRole("radiogroup", { name: "シールの色" });
  await expect(colors.getByRole("radio")).toHaveCount(5);

  // 赤（10代）で福島県を2回、青で東京都を1回
  await page.getByRole("button", { name: /^福島県/ }).click();
  await page.getByRole("button", { name: /^福島県/ }).click();
  await colors.getByRole("radio", { name: /青/ }).click();
  await page.getByRole("button", { name: /^東京都/ }).click();
  await expect(page.getByRole("button", { name: "福島県（2）" })).toBeVisible();
  await expect(page.getByRole("button", { name: "東京都（1）" })).toBeVisible();
  await expect(colors.getByRole("radio", { name: /10代/ })).toContainText("2");
  await expect(page.getByText(/合計\s*3\s*枚/)).toBeVisible();

  // 取り消しは自分の直前の1回
  await page.getByRole("button", { name: "↶ 自分の直前を取り消す" }).click();
  await expect(page.getByText("東京都（青）を1枚取り消しました")).toBeVisible();
  await expect(page.getByRole("button", { name: "東京都（0）" })).toBeVisible();

  // 他の人が数えた分もリアルタイムで反映される
  const api = "http://localhost:8000";
  const id = page.url().split("/").pop()!;
  await page.request.post(`${api}/api/stickers/${id}/tap`, { data: { pref: "海外", color: "purple" } });
  await expect(page.getByRole("button", { name: "海外（1）" })).toBeVisible();

  // 集計表
  await page.getByRole("radio", { name: "集計表" }).click();
  const table = page.getByRole("table");
  await expect(table.getByRole("row", { name: /福島県\s*2\s*0\s*0\s*0\s*0\s*2/ })).toBeVisible();
  await expect(table.getByRole("row", { name: /東京都/ })).toHaveCount(0);
  await expect(table.getByRole("row", { name: /合計\s*2\s*0\s*0\s*0\s*1\s*3/ })).toBeVisible();

  // CSV と PDF を保存できる
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__saved = [];
    w.showSaveFilePicker = async (opts: { suggestedName: string }) => ({
      createWritable: async () => ({
        write: async (b: Blob) => {
          const buf = new Uint8Array(await b.arrayBuffer());
          (w.__saved as unknown[]).push({ name: opts.suggestedName, head: new TextDecoder().decode(buf.slice(0, 200)) });
        },
        close: async () => {},
      }),
    });
  });
  await page.getByText("CSVで保存（0件を除く）").click();
  await expect(page.getByText("保存しました").first()).toBeVisible();
  await page.getByText("PDFで保存（0件を除く）").click();
  await expect.poll(async () => (await page.evaluate(() => (window as unknown as { __saved: unknown[] }).__saved)).length).toBe(2);
  const saved = (await page.evaluate(() => (window as unknown as { __saved: { name: string; head: string }[] }).__saved))!;
  expect(saved[0].name).toMatch(/\.csv$/);
  expect(saved[0].head).toContain("都道府県,10代,青,黄,緑,海外の方,計");
  expect(saved[0].head).toContain("福島県,2,0,0,0,0,2");
  expect(saved[1].name).toMatch(/\.pdf$/);
  expect(saved[1].head.startsWith("%PDF-")).toBe(true);

  // 終了すると数えられない
  await page.getByRole("button", { name: "終了にする" }).click();
  await page.getByRole("radio", { name: "数える" }).click();
  await expect(page.getByRole("button", { name: /^福島県/ })).toBeDisabled();
  await page.getByRole("button", { name: "再開" }).click();
  await expect(page.getByRole("button", { name: /^福島県/ })).toBeEnabled();

  // 一覧に合計が出る
  await page.getByRole("link", { name: "シール集計" }).first().click();
  await expect(page.getByRole("link", { name: new RegExp(`${name}.*3枚`) })).toBeVisible();
});
