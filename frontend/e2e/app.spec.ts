import { expect, test } from "./fixtures";

test.describe.configure({ mode: "serial" });

// 再試行のときに前回の実行で作ったデータと名前が重ならないよう、実行ごとに印を付ける
const RUN = Date.now().toString(36).slice(-4);
const task = () => `E2Eの見積もり依頼${RUN}${test.info().repeatEachIndex}`;

test("ホーム: 挨拶と次のイベントまでの日数", async ({ page }) => {
  const api = "http://localhost:8000";
  const name = `E2E物産展${RUN}`;
  await page.request.post(`${api}/api/events`, { data: { title: name, start_time: "2029-12-31T01:00:00+00:00" } });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /^(早起きですね|おはようございます|こんにちは|こんばんは|夜更かしですね)、Masayaさん$/ })
  ).toBeVisible();
  await expect(page.getByText("次のイベント")).toBeVisible();
});


test("ホーム: 挨拶が時間帯で変わる", async ({ page }) => {
  const cases: [string, string][] = [
    ["05:00", "早起きですね"],
    ["08:00", "おはようございます"],
    ["13:00", "こんにちは"],
    ["20:00", "こんばんは"],
    ["01:00", "夜更かしですね"],
  ];
  for (const [time, word] of cases) {
    await page.clock.setFixedTime(new Date(`2026-11-24T${time}:00+09:00`));
    await page.goto("/");
    await expect(page.getByRole("heading", { name: `${word}、Masayaさん` })).toBeVisible();
  }
});

test("タスク: 1行で追加・チェック項目・コメント・削除と元に戻す", async ({ page }) => {
  await page.goto("/tasks");
  await page.getByRole("textbox", { name: "タスクを追加" }).fill(task());
  await page.getByRole("textbox", { name: "タスクを追加" }).press("Enter");
  await expect(page.getByText(task(), { exact: true })).toBeVisible();

  await page.getByText(task(), { exact: true }).click();
  await page.getByPlaceholder("項目を追加").fill("3社に依頼");
  await page.getByPlaceholder("項目を追加").press("Enter");
  await page.getByPlaceholder("コメント（@名前で通知）").fill("よろしくお願いします");
  await page.getByRole("button", { name: "送信" }).click();
  // 送信直後は入力欄にも同じ文字が一瞬残るため、表示されたコメント本文で確かめる
  await expect(page.getByRole("paragraph").filter({ hasText: "よろしくお願いします" })).toBeVisible();
  await page.locator('button[form="task-form"]').click();
  await expect(page.getByRole("button", { name: new RegExp(`${task()} ☑ 0/1`) })).toBeVisible();

  await page.getByText(task(), { exact: true }).click();
  // 確認で「キャンセル」なら消えない
  page.once("dialog", (d) => d.dismiss());
  await page.getByText("タスクを削除").click();
  await expect(page.getByText("タスクを削除")).toBeVisible();
  page.once("dialog", (d) => {
    expect(d.message()).toContain("削除しますか");
    d.accept();
  });
  await page.getByText("タスクを削除").click();
  await expect(page.getByText("ゴミ箱に移しました")).toBeVisible();
  await page.getByRole("button", { name: "元に戻す" }).click();
  await expect(page.getByText(task(), { exact: true })).toBeVisible();
});

test("ゴミ箱: 空にすると完全に削除される", async ({ page }) => {
  const name = `E2E消す${RUN}${test.info().repeatEachIndex}`;
  await page.goto("/tasks");
  await page.getByRole("textbox", { name: "タスクを追加" }).fill(name);
  await page.getByRole("textbox", { name: "タスクを追加" }).press("Enter");
  await page.getByText(name, { exact: true }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByText("タスクを削除").click();
  await expect(page.getByText("ゴミ箱に移しました")).toBeVisible();

  // 1件だけ完全削除
  const one = `E2E一件${RUN}${test.info().repeatEachIndex}`;
  await page.getByRole("textbox", { name: "タスクを追加" }).fill(one);
  await page.getByRole("textbox", { name: "タスクを追加" }).press("Enter");
  await page.getByText(one, { exact: true }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByText("タスクを削除").click();
  await page.goto("/trash");
  page.once("dialog", (d) => d.accept());
  await page
    .locator("div")
    .filter({ hasText: one })
    .filter({ has: page.getByRole("button", { name: "完全削除" }) })
    .last()
    .getByRole("button", { name: "完全削除" })
    .click();
  await expect(page.getByText(`「${one}」を完全に削除しました`)).toBeVisible();
  await expect(page.getByText(name)).toBeVisible();
  page.once("dialog", (d) => {
    expect(d.message()).toContain("元に戻せません");
    d.accept();
  });
  await page.getByRole("button", { name: "ゴミ箱を空にする" }).click();
  await expect(page.getByText("ゴミ箱は空です")).toBeVisible();
});

test("イベント: 出欠を登録できる", async ({ page }) => {
  const name = `E2E出展${RUN}${test.info().repeatEachIndex}`;
  await page.goto("/events");
  await page.getByRole("radio", { name: "リスト" }).click();
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await page.getByLabel("新規イベント").locator("input").first().fill(name);
  await page.getByLabel("新規イベント").locator('input[type="datetime-local"]').first().fill("2030-05-01T09:00");
  await page.locator('button[form="event-form"]').click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  // 同じ画面に他のイベントがあっても、このイベントのカードの中だけを操作する
  const card = page.locator("div.rounded-2xl").filter({ has: page.getByText(name, { exact: true }) }).last();
  await card.getByRole("button", { name: "参加", exact: true }).click();
  await expect(card.getByText(/参加 1/)).toBeVisible();

  // 変更履歴（管理者）: 変わった項目が「変更前 → 変更後」で出る
  const api = "http://localhost:8000";
  const ev = ((await (await page.request.get(`${api}/api/events`)).json()) as { id: string; title: string }[]).find(
    (e) => e.title === name
  )!;
  await page.request.patch(`${api}/api/events/${ev.id}`, { data: { location: "浪江町" } });
  await card.getByRole("button", { name: "変更履歴" }).click();
  await expect(card.getByText("（なし） → 浪江町")).toBeVisible();

  // 削除は確認してから
  page.once("dialog", (d) => d.dismiss());
  await card.getByRole("button", { name: "ゴミ箱に移す" }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
});

test("カレンダー: 祝日を表示する", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-10T12:00:00+09:00"));
  await page.goto("/events?view=calendar");
  await expect(page.getByText("文化の日").first()).toBeVisible();
  await expect(page.getByText("勤労感謝の日").first()).toBeVisible();
});

test("検索: ページ・タスクの候補が出る", async ({ page }) => {
  await page.goto("/");
  // 画面の準備（キー入力の受付）が終わる前に押すと開かないため、開くまで押し直す
  const input = page.getByPlaceholder(/シール集計・活動ログを検索/);
  await expect(async () => {
    await page.keyboard.press("Control+k");
    await expect(input).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await input.fill("見積");
  await expect(page.getByRole("dialog", { name: "検索・移動" }).getByText(task())).toBeVisible();
});

test("タスク: 繰り返し・@名前の候補・コメントの検索", async ({ page }) => {
  const name = `E2E定例${RUN}${test.info().repeatEachIndex}`;
  await page.goto("/tasks");
  await page.getByRole("textbox", { name: "タスクを追加" }).fill(name);
  await page.getByRole("textbox", { name: "タスクを追加" }).press("Enter");
  await page.getByText(name, { exact: true }).click();

  // 繰り返し
  await page.getByLabel("繰り返し").selectOption("weekly");
  // @ で始めるとメンバーの候補が出て、選ぶと入る
  const box = page.getByPlaceholder("コメント（@名前で通知）");
  await box.fill(`@Ky`);
  await page.getByRole("option", { name: "@Kyosei" }).click();
  await expect(box).toHaveValue("@Kyosei ");
  await box.pressSequentially(`確認お願いします${RUN}`);
  await page.getByRole("button", { name: "送信" }).click();
  const shown = page.getByRole("paragraph").filter({ hasText: `確認お願いします${RUN}` });
  await expect(shown.getByText("@Kyosei")).toBeVisible();
  await page.locator('button[form="task-form"]').click();
  await expect(page.getByRole("button", { name: new RegExp(`${name}.*↻毎週`) })).toBeVisible();

  // コメントの中身でも検索でき、選ぶとそのタスクが開く
  await page.goto("/");
  const input = page.getByPlaceholder(/シール集計・活動ログを検索/);
  await expect(async () => {
    await page.keyboard.press("Control+k");
    await expect(input).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await input.fill(`確認お願いします${RUN}`);
  await page.getByRole("dialog", { name: "検索・移動" }).getByText(name).click();
  await expect(page.getByPlaceholder("コメント（@名前で通知）")).toBeVisible();
});

test("メンバー: 削除するときに担当を引き継ぐ", async ({ page }) => {
  const api = "http://localhost:8000";
  const who = `E2E引退${RUN}${test.info().repeatEachIndex}`;
  await page.request.post(`${api}/api/members`, { data: { name: who, email: `${who.toLowerCase()}@ecs.osaka-u.ac.jp` } });
  const t = await (await page.request.post(`${api}/api/tasks`, { data: { title: `${who}の仕事`, assignee_name: who } })).json();

  await page.goto("/");
  await page.getByRole("button", { name: "アカウント" }).click();
  await page.getByText("メンバー管理").click();
  await page.getByRole("button", { name: new RegExp(who) }).click();
  await page.getByText("メンバーから削除").click();
  await expect(page.getByText(`${who}の仕事`)).toBeVisible();
  await page.getByLabel("引き継ぐ人").selectOption("Kyosei");
  page.once("dialog", (d) => d.accept());
  await page.getByText("引き継いで削除").click();
  await expect(page.getByText(`引き継いで、${who}さんを削除しました`)).toBeVisible();
  const tasks = (await (await page.request.get(`${api}/api/tasks`)).json()) as { id: string; assignee_name: string }[];
  expect(tasks.find((x) => x.id === t.id)?.assignee_name).toBe("Kyosei");
});
