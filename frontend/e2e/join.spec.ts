import { expect, test } from "./fixtures";

test("参加リクエスト: 管理者が許可・見送りできる", async ({ page }) => {
  let pending = [
    { id: "r1", email: "shinjin@ecs.osaka-u.ac.jp", name: "E2E新人", note: "広報", requested_by: null, created_at: "2026-11-23T00:00:00Z" },
    { id: "r2", email: "dare@ecs.osaka-u.ac.jp", name: "E2E誰か", note: null, requested_by: "Kyosei", created_at: "2026-11-23T00:01:00Z" },
  ];
  const decided: string[] = [];
  await page.route("**/api/member-requests", (route) => route.fulfill({ json: pending }));
  await page.route("**/api/member-requests/*/*", (route) => {
    const [, id, action] = new URL(route.request().url()).pathname.match(/member-requests\/([^/]+)\/(\w+)$/)!;
    decided.push(`${id}:${action}`);
    pending = pending.filter((r) => r.id !== id);
    return route.fulfill({ json: { id, status: action } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "アカウント" }).click();
  await expect(page.getByText("参加リクエスト 2")).toBeVisible();
  await page.getByText("メンバー管理").click();
  await expect(page.getByText("参加リクエスト（2）")).toBeVisible();
  await expect(page.getByText("dare@ecs.osaka-u.ac.jp · Kyoseiさんから")).toBeVisible();
  await page.getByRole("button", { name: "許可" }).first().click();
  await expect(page.getByText("E2E新人さんをメンバーにしました")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "見送る" }).click();
  await expect(page.getByText(/参加リクエスト（/)).toHaveCount(0);
  expect(decided).toEqual(["r1:approve", "r2:reject"]);
});

test("参加リクエスト: メンバーでない人は申請画面になり、許可されると入れる", async ({ page }) => {
  let status = "none";
  let me = 403;
  await page.route("**/api/me", (route) =>
    me === 403
      ? route.fulfill({ status: 403, json: { detail: "まだメンバーではありません", code: "not_member" } })
      : route.continue()
  );
  await page.route("**/api/join", async (route) => {
    if (route.request().method() === "POST") {
      expect(route.request().postDataJSON()).toEqual({ name: "新人 太郎", note: "企画" });
      status = "pending";
      return route.fulfill({ status: 201, json: { status: "pending", name: "新人 太郎" } });
    }
    return route.fulfill({
      json: { status, email: "taro@ecs.osaka-u.ac.jp", name: status === "pending" ? "新人 太郎" : undefined, name_hint: "新人 太郎" },
    });
  });
  await page.goto("/");
  await expect(page.getByText("このアカウントはまだメンバーではありません。参加を申請してください。")).toBeVisible();
  await expect(page.getByLabel("名前")).toHaveValue("新人 太郎");
  await page.getByLabel("ひとこと").fill("企画");
  await page.getByRole("button", { name: "参加を申請する" }).click();
  await expect(page.getByText("新人 太郎さんの参加を申請しました。管理者が許可すると使えるようになります。")).toBeVisible();

  // 許可された
  status = "member";
  me = 200;
  await page.getByRole("button", { name: "許可されたか確認する" }).click();
  await expect(page.getByRole("heading", { name: /、Masayaさん$/ })).toBeVisible();
});
