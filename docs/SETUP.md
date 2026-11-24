# 新規セットアップ手順

所要時間: 60分ほど。上から順に進める（前の手順で控えた値を後で使う）。
必要なアカウント: GitHub（このリポジトリ）、Supabase、Render、Vercel（いずれも無料プランで可）。

---

## 1. Supabase プロジェクトを作る

1. https://supabase.com/dashboard → **New project**
   - Name: `toloc` / Database Password: 「Generate」→ 控える / Region: **Northeast Asia (Tokyo)**
2. 左メニュー **SQL Editor** → リポジトリの `schema.sql` を**全部**貼り付け → **Run** →「Success」
3. Project Settings → **API Keys** で控える
   - Publishable key（`sb_publishable_...`）…… 【A】公開用
   - Secret key（`sb_secret_...`）…… 【B】秘密（人に見せない）
4. Project URL を控える …… 【C】`https://xxxx.supabase.co`

## 2. ログインの方法を決める

大学のアカウントでログインする。大学のメールが **Google** か **Microsoft 365** かで手順が違う。

### Google の場合

1. https://console.cloud.google.com → 新しいプロジェクト `toloc`
2. 「APIとサービス」→ **OAuth 同意画面** → アプリ名 `Toloc OS`、対象は「外部」→ 作成後に「アプリを公開」
3. **クライアント** → 作成 → 種類 **ウェブアプリケーション**
   - 承認済みのリダイレクト URI: `【C】/auth/v1/callback`
   - クライアントID 【D】・シークレット 【E】を控える
4. Supabase → Authentication → Sign In / Providers → **Google** をオン、【D】【E】を入れて Save

### Microsoft 365 の場合

1. https://entra.microsoft.com → アプリの登録 → 新規登録（組織の管理者の許可が必要な場合あり）
   - リダイレクト URI（Web）: `【C】/auth/v1/callback`
   - アプリケーション（クライアント）ID 【D】、証明書とシークレット → 新しいシークレット 【E】
2. Supabase → Authentication → Sign In / Providers → **Azure** をオン、【D】【E】を入れて Save
3. 4章の Vercel の設定で `NEXT_PUBLIC_AUTH_PROVIDER=azure` にする

### 共通

- Supabase → Authentication → **URL Configuration**
  - Site URL: Vercel の本番URL …… 【F】（例 `https://toloc-os.vercel.app`、末尾 `/` なし。4章で決まる）
  - Redirect URLs: 【F】、`http://localhost:3000`
- Email ログインはオフにする（Sign In / Providers → Email）

## 3. Render（バックエンド）を作る

1. https://render.com → New → **Web Service** → このリポジトリ
   - Name: `toloc-backend` / Root Directory: `backend` / Region: Singapore
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
2. **Environment** に追加

| 名前 | 値 |
|---|---|
| `SUPABASE_URL` | 【C】 |
| `SUPABASE_SERVICE_ROLE_KEY` | 【B】 |
| `ADMIN_EMAILS` | 最初の管理者の大学メール（複数はカンマ区切り） |
| `ALLOWED_EMAIL_DOMAIN` | ログインを許すドメイン（既定 `osaka-u.ac.jp`。サブドメインも許可） |
| `APP_ENV` | `production` |
| `CORS_ALLOW_ORIGINS` | 【F】 |
| `CRON_SECRET` | 英数字40文字ほど …… 【G】 |
| `CALENDAR_FEED_TOKEN` | 英数字40文字ほど（【G】とは別） |
| `DISCORD_WEBHOOK_URL` | 任意。毎朝のまとめ・担当通知の送り先 |

3. デプロイ後、`https://toloc-backend.onrender.com/api/health` が `"supabase_connected":true` になること …… 【H】

## 4. Vercel（フロント）を作る

1. https://vercel.com → Add New → Project → このリポジトリ → Root Directory: `frontend`
2. **Environment Variables**

| 名前 | 値 |
|---|---|
| `NEXT_PUBLIC_API_BASE` | 【H】のURL（`https://toloc-backend.onrender.com`） |
| `NEXT_PUBLIC_SUPABASE_URL` | 【C】 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 【A】 |
| `NEXT_PUBLIC_AUTH_PROVIDER` | `google` または `azure` |
| `NEXT_PUBLIC_MEMBER_EMAIL_DOMAIN` | メンバー追加で省略したときに補うドメイン（既定 `ecs.osaka-u.ac.jp`） |

3. Deploy → 本番URL【F】が決まる。2章の URL Configuration と 3章の `CORS_ALLOW_ORIGINS` に【F】を入れる

## 5. 動作確認

1. 【F】を開く →「大学のアカウントでログイン」→ `ADMIN_EMAILS` の人は管理者として入れる
2. シール集計 → 新しい集計 → 都道府県を押して数が増える。別の端末でも同じ数が見える

## 6. メンバー登録（管理者の許可制）

- 新しい人は【F】を開いて大学アカウントでログイン → 名前を入れて「参加を申請する」
- 管理者: 右上のアイコン → **メンバー管理** → 参加リクエストの「許可」
- 管理者はメンバー管理から直接追加もできる

## 7. 自動処理（GitHub）

GitHub → Settings → Secrets and variables → Actions → **Secrets**

- `BACKEND_URL` = 【H】
- `CRON_SECRET` = 【G】

毎朝7時の Discord まとめ・週1バックアップが動く。
スリープ防止は https://cron-job.org で 【H】`/api/health` を日本時間7〜23時に10分おきに開く。

## 8. 任意

- スマホへの通知: `DEPLOY.md` の4章
