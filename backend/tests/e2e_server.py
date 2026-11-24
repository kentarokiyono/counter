"""
画面の自動テスト（Playwright）用のバックエンド。
本物の Supabase の代わりにメモリ上の偽物を使い、ログインも省略する（開発用管理者 Masaya として動く）。

    python tests/e2e_server.py   # http://127.0.0.1:8000
"""
import os
import sys

os.environ.update(
    SUPABASE_URL="http://supabase.test",
    SUPABASE_SERVICE_ROLE_KEY="e2e",
    AUTH_DISABLED="true",
    APP_ENV="development",
    CALENDAR_FEED_TOKEN="e2e-feed",
)
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))

import uvicorn  # noqa: E402

import auth  # noqa: E402
import db  # noqa: E402
import main  # noqa: E402
from fake_supabase import FakeSupabase  # noqa: E402

fake = FakeSupabase()
for name in ["Masaya", "Kyosei", "Noriko"]:
    fake.table("members").insert({"name": name, "email": f"{name.lower()}@ecs.osaka-u.ac.jp", "role": "member"}).execute()
main.app.dependency_overrides[db.get_supabase] = lambda: fake
db.init_supabase = lambda: fake
db.get_supabase = lambda: fake
db.get_supabase_or_none = lambda: fake
auth.DEV_MEMBER = auth.Member(id="dev", name="Masaya", email="masaya@ecs.osaka-u.ac.jp", role="admin")


if __name__ == "__main__":
    uvicorn.run(main.app, host="127.0.0.1", port=int(os.environ.get("E2E_BACKEND_PORT", "8000")), log_level="warning")
