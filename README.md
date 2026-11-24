# Toloc OS

大阪大学 福島拠点 観光班「Toloc」の公式OS。班の業務（タスク・イベント・シール集計・活動ログ）をまとめたWebアプリ。
スマホのホーム画面に追加して使える（PWA）。デザインは wuscp-control-plane と共通（iOS 風・ライト/ダーク対応）。

| 知りたいこと | 見るファイル |
|---|---|
| 初めて立ち上げる | `docs/SETUP.md` |
| 構成・設定値・保守 | `DEPLOY.md` |

## 機能

| メニュー | 内容 |
|---|---|
| ホーム | 今週の予定、今日やること、次のイベントまでの日数、集計中のシール集計 |
| タスク | カンバン・一覧、担当・期限・分類（企画／広報・SNS／地域連携・渉外／現地活動／調査・集計／会計・事務）、チェック項目、コメント（@名前で通知）、繰り返し |
| イベント | カレンダー・一覧、担当、出欠、持ち物チェック（テンプレートあり）、iCal 配信 |
| シール集計 | 来場者アンケート（色 × 都道府県）を複数人のスマホで同時に数える。色の意味（例: 赤 = 10代）を集計ごとに設定、自分の直前の操作を取り消し、集計表・多い都道府県のグラフ、PDF・CSV 書き出し |
| 活動ログ | 現地活動・出展ごとに、区分（準備／現地対応／撤収／移動）別の作業時間とメモを記録。まとめを Markdown・CSV で書き出し |
| その他 | 統計、最近の動き（管理者）、ゴミ箱（30日）、検索（⌘K）、メンバー管理（参加は管理者の許可制） |

変更はリアルタイムで全員の画面に反映される。毎朝の Discord まとめ、スマホ通知（Web Push）、週1バックアップに対応。

## 構成

```
frontend/   Next.js 16 + Tailwind CSS 4（Vercel）
backend/    FastAPI（Render）。Supabase には backend だけが service_role で接続
schema.sql  Supabase（PostgreSQL）のテーブル・関数。SQL Editor で全体を実行（何度実行しても安全）
.github/    CI（テスト・型チェック・E2E）、毎朝のまとめ、週1バックアップ
```

## 開発

```bash
# backend
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env        # SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY を記入（AUTH_DISABLED=true でログイン省略）
uvicorn main:app --reload
python -m pytest -q tests   # テスト（Supabase 不要）

# frontend
cd frontend
npm ci
cp .env.local.example .env.local
npm run dev                 # http://localhost:3000
npx tsc --noEmit
npm run build && npm run e2e   # 画面の自動テスト（偽のバックエンドで動く）
```

## シール集計の仕組み

- 1回の調査（イベント・日ごと）を1件の「集計」として作る。色は最大8色、意味は自由に付けられる
- 数は `sticker_counts`（集計 × 都道府県 × 色）に持ち、加算・取り消しは DB 関数 `sticker_tap` / `sticker_undo` で行う（同時に押しても数がずれない）
- 押した記録は `sticker_taps` に残り、「自分の直前を取り消す」は本人の最後の1回だけを取り消す
- 押すと画面にはすぐ反映し、サーバーの値で確定する（他の人の操作もリアルタイムで反映）
- 終了にした集計は数えられない（再開で戻せる）。リセットは作成者か管理者のみ
