from datetime import date

from conftest import H
from cron import build_digest


def test_requires_secret(client):
    assert client.post("/api/cron/daily-digest").status_code == 401
    assert client.post("/api/cron/daily-digest", headers={"X-Cron-Secret": "wrong"}).status_code == 401
    # ログイン用トークンでは呼べない
    assert client.post("/api/cron/daily-digest", headers=H("admin")).status_code == 401


def test_dry_run(client):
    client.post("/api/tasks", headers=H("masaya"), json={"title": "古い作業", "due_date": "2000-01-01", "assignee_name": "Kyosei"})
    r = client.post("/api/cron/daily-digest?dry_run=true", headers={"X-Cron-Secret": "cron-test-secret"}).json()
    assert r["sent"] is False and "期限切れ（1件）" in r["message"] and "古い作業" in r["message"]


def test_build_digest_sections():
    today = date(2026, 11, 23)
    tasks = [
        {"title": "A", "status": "todo", "due_date": "2026-11-20", "assignee_name": "Masaya"},
        {"title": "B", "status": "todo", "due_date": "2026-11-23", "assignee_name": None},
        {"title": "C", "status": "done", "due_date": "2026-11-20", "assignee_name": "X"},
        {"title": "D", "status": "todo", "due_date": "2026-11-24", "assignee_name": "Kyosei"},
    ]
    events = [
        {"title": "展示", "status": "confirmed", "start_time": "2026-11-24T01:00:00+00:00", "location": "道の駅なみえ",
         "assignees": ["Masaya"], "checklist": [{"item": "テント", "done": True}, {"item": "パネル", "done": False}]},
        {"title": "中止", "status": "cancelled", "start_time": "2026-11-24T01:00:00+00:00"},
    ]
    text = build_digest(tasks, events, today)
    assert "期限切れ（1件）" in text and "・A" in text and "・C" not in text
    assert "今日まで（1件）" in text and "未割当" in text
    assert "明日まで（1件）" in text
    assert "明日 10:00 展示 @道の駅なみえ 準備 1/2" in text and "未準備: パネル" in text and "中止" not in text


def test_nothing_to_say():
    assert build_digest([], [], date(2026, 11, 23)) is None
