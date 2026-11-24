import os
import sys

import pytest

os.environ.setdefault("SUPABASE_URL", "http://supabase.test")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")
os.environ["ADMIN_EMAILS"] = "kanri@ecs.osaka-u.ac.jp"
os.environ["AUTH_DISABLED"] = "false"
os.environ["CRON_SECRET"] = "cron-test-secret"
os.environ["CALENDAR_FEED_TOKEN"] = "feed-test-token"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fake_supabase import FakeSupabase  # noqa: E402

# 各モジュールが `from db import get_supabase` で本物の関数を掴んだ状態にしてから差し替える
import db  # noqa: E402
import main  # noqa: E402,F401

db._original_get_supabase = db.get_supabase

TOKENS = {
    "admin": ("kanri@ecs.osaka-u.ac.jp", {"full_name": "管理者"}),
    "masaya": ("masaya@ecs.osaka-u.ac.jp", {}),
    "kyosei": ("kyosei@ecs.osaka-u.ac.jp", {}),
    "outside": ("someone@gmail.com", {}),
    "unregistered": ("nobody@ecs.osaka-u.ac.jp", {}),
}


@pytest.fixture()
def fake_db(monkeypatch):
    import auth
    import config
    import db

    config.get_settings.cache_clear()
    fake = FakeSupabase()
    for key, (email, meta) in TOKENS.items():
        fake.auth.users[f"tok-{key}"] = (email, meta)
    for name, email in [("Masaya", "masaya@ecs.osaka-u.ac.jp"), ("Kyosei", "kyosei@ecs.osaka-u.ac.jp"), ("Noriko", None)]:
        fake.table("members").insert({"name": name, "email": email, "role": "member"}).execute()
    monkeypatch.setattr(db, "init_supabase", lambda: fake)
    monkeypatch.setattr(db, "get_supabase", lambda: fake)
    auth.forget_cached_members()
    yield fake
    config.get_settings.cache_clear()


@pytest.fixture()
def client(fake_db):
    from fastapi.testclient import TestClient

    import db
    import main

    main.app.dependency_overrides[db._original_get_supabase] = lambda: fake_db
    with TestClient(main.app) as c:
        yield c
    main.app.dependency_overrides.clear()


def H(who: str) -> dict:
    return {"Authorization": f"Bearer tok-{who}"}
