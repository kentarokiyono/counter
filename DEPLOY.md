# 運用ガイド（構成・設定値・保守）

初めて立ち上げるときは `docs/SETUP.md`。このファイルは「どこに何が設定されているか」と「日々の保守」のまとめ。

---

## 1. 構成

| 役割 | サービス | 備考 |
|---|---|---|
| 画面（フロント） | Vercel（`main` を自動デプロイ） | Root Directory `frontend` |
| サーバー（バックエンド） | Render（`main` を自動デプロイ） | Root Directory `backend` |
| データベース・ログイン | Supabase（東京） | Google または Microsoft のログイン |
| 定期実行 | GitHub Actions | 毎朝のまとめ・週1バックアップ・テスト |
| スリープ防止 | cron-job.org | 日本時間7〜23時に10分おきに `/api/health` |

更新は `main` へマージするだけ（5〜10分で反映）。

---

## 2. 設定値の一覧

### Render（バックエンド → Environment）

| 名前 | 内容 | 必須 |
|---|---|---|
| `SUPABASE_URL` | Supabase の Project URL | 必須 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase の Secret key（`sb_secret_...`） | 必須 |
| `APP_ENV` | `production` | 必須 |
| `CORS_ALLOW_ORIGINS` | フロントの本番URL | 必須 |
| `ADMIN_EMAILS` | 最初の管理者のメール（カンマ区切り） | 必須 |
| `ALLOWED_EMAIL_DOMAIN` | ログインを許すドメイン（カンマ区切り・サブドメインも許可。既定 `osaka-u.ac.jp`。空なら制限なし） | 任意 |
| `CRON_SECRET` | 定期実行の合言葉（GitHub の Secrets と同じ値） | 必須 |
| `CALENDAR_FEED_TOKEN` | カレンダー配信URLの合言葉 | 任意 |
| `DISCORD_WEBHOOK_URL` | 毎朝のまとめ・担当通知の送り先 | 任意 |
| `DISCORD_ALERT_WEBHOOK_URL` | エラー通知の送り先（無ければ上と同じ） | 任意 |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | スマホへの通知（4章） | 任意 |

### フロント（Vercel の環境変数、または `frontend/.env.production`）

ブラウザに配られる公開値だけを置く（秘密のキーは絶対に置かない）。

| 名前 | 内容 |
|---|---|
| `NEXT_PUBLIC_API_BASE` | バックエンドのURL |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase の Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase の Publishable key（`sb_publishable_...`） |
| `NEXT_PUBLIC_AUTH_PROVIDER` | `google`（既定）/ `azure` |
| `NEXT_PUBLIC_MEMBER_EMAIL_DOMAIN` | メンバー追加で `@` 以降を省略したときに補うドメイン |
| `NEXT_PUBLIC_LOGIN_HINT_DOMAIN` | 任意。Google ログインで優先表示するドメイン |

### GitHub（Settings → Secrets and variables → Actions）

| 名前 | 内容 |
|---|---|
| `BACKEND_URL` | バックエンドのURL |
| `CRON_SECRET` | Render と同じ値 |

---

## 3. データベースの変更

`schema.sql` を Supabase → SQL Editor に全部貼って実行する。何度実行しても安全（既にある表・列はそのまま）。

---

## 4. スマホへの通知（任意）

1. 鍵を作る: `cd backend && python -m push_keys`
2. 出力の `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` を Render に設定。`VAPID_SUBJECT` は `mailto:管理者のメール`
3. 画面右上のアイコン → 通知 をオン

---

## 5. 保守

### バックアップと復元

- 毎週月曜 3:00 に GitHub Actions の **Backup** が全データを保存（Actions の実行結果 → Artifacts、90日保存）
- 復元（`.env` に復元先の `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` を入れて実行）:
  ```
  cd backend
  python restore_backup.py backup.json.gz           # 件数の確認だけ
  python restore_backup.py backup.json.gz --apply   # 書き戻す（同じIDは上書き）
  ```

### 無料枠の目安

| サービス | 上限 | 注意 |
|---|---|---|
| Supabase | DB 500MB、転送 5GB/月 | 1週間アクセスが無いと停止（毎朝のまとめで防止） |
| Vercel | 転送 100GB/月 | |
| Render | 750時間/月 | 15分無通信でスリープ。cron-job.org を24時間にすると枠を使い切る |
| GitHub Actions | 2,000分/月 | |

### 部品の更新

Dependabot が月1回、更新の Pull Request を作る。CI が通っていればマージしてよい。

### うまくいかないとき

| 症状 | 確認すること |
|---|---|
| ログイン画面に戻される | 画面の赤字。Supabase の URL Configuration、フロントのキーとURL |
| 「〜のアカウントでログインしてください」 | Render の `ALLOWED_EMAIL_DOMAIN` |
| 「サーバーに接続できません」 | `/api/health`。`supabase_connected:false` なら Render の Supabase の設定と `schema.sql` 末尾の権限付与 |
| `permission denied for table` / `function sticker_tap does not exist` | `schema.sql` を全部実行し直す |
| 毎朝のまとめが来ない | GitHub の `BACKEND_URL` / `CRON_SECRET`、Render の `DISCORD_WEBHOOK_URL` |
| 初回の表示が遅い | Render のスリープ（最大1分） |
