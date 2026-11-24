import config
from calendar_feed import build_ics
from conftest import H


def test_calendar_feed_requires_token(client):
    client.post("/api/events", headers=H("masaya"), json={"title": "地域交流, 展示; 準備", "start_time": "2026-11-25T01:00:00+00:00", "location": "福島城"})
    assert client.get("/api/calendar/feed/wrong.ics").status_code == 404
    r = client.get("/api/calendar/feed/feed-test-token.ics")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/calendar")
    body = r.text
    assert "BEGIN:VEVENT" in body and "DTSTART:20261125T010000Z" in body and "DTEND:20261125T020000Z" in body
    assert "SUMMARY:地域交流\\, 展示\\; 準備" in body
    assert client.get("/api/calendar/feed-url", headers=H("masaya")).json()["path"] == "/api/calendar/feed/feed-test-token.ics"


def test_ics_lines_are_folded():
    ics = build_ics([{"id": "1", "title": "あ" * 60, "start_time": "2026-01-01T00:00:00Z", "status": "planned"}])
    assert all(len(line.encode()) <= 75 for line in ics.split("\r\n"))


def test_push_disabled_without_keys(client):
    assert client.get("/api/push/public-key", headers=H("masaya")).json()["enabled"] is False
    r = client.post("/api/push/subscribe", headers=H("masaya"), json={"endpoint": "https://push.example/abc", "keys": {"p256dh": "x" * 20, "auth": "y" * 8}})
    assert r.status_code == 404


def test_push_subscribe_and_assignment_notifies(client, fake_db, monkeypatch):
    import push
    from push_keys import generate

    pub, priv = generate()
    monkeypatch.setenv("VAPID_PUBLIC_KEY", pub)
    monkeypatch.setenv("VAPID_PRIVATE_KEY", priv)
    config.get_settings.cache_clear()
    sent = []
    import pywebpush

    monkeypatch.setattr(pywebpush, "webpush", lambda **kw: sent.append(kw))
    body = {"endpoint": "https://push.example/k", "keys": {"p256dh": "x" * 20, "auth": "y" * 8}}
    assert client.post("/api/push/subscribe", headers=H("kyosei"), json=body).status_code == 201
    assert fake_db.tables["push_subscriptions"][0]["member_name"] == "Kyosei"
    # Masaya が Kyosei を担当にすると Kyosei に通知
    client.post("/api/tasks", headers=H("masaya"), json={"title": "見積もり", "assignee_name": "Kyosei"})
    import time

    for _ in range(50):
        if sent:
            break
        time.sleep(0.02)
    assert sent and "見積もり" in sent[0]["data"]
    # 自分を担当にしたときは通知しない
    sent.clear()
    client.post("/api/tasks", headers=H("kyosei"), json={"title": "自分の", "assignee_name": "Kyosei"})
    time.sleep(0.1)
    assert sent == []
    assert push.enabled()


def test_activity_log_filters(client):
    client.post("/api/tasks", headers=H("masaya"), json={"title": "A"})
    client.post("/api/tasks", headers=H("kyosei"), json={"title": "B"})
    client.post("/api/events", headers=H("kyosei"), json={"title": "節目", "start_time": "2027-01-01T00:00:00Z"})
    only_k = client.get("/api/activity-log?actor=Kyosei", headers=H("admin")).json()
    assert {x["actor"] for x in only_k} == {"Kyosei"} and len(only_k) == 2
    tasks_only = client.get("/api/activity-log?kind=task", headers=H("admin")).json()
    assert {x["kind"] for x in tasks_only} == {"task"}
    first = client.get("/api/activity-log?limit=1", headers=H("admin")).json()
    rest = client.get(f"/api/activity-log?before={first[0]['created_at']}", headers=H("admin")).json()
    assert first[0]["id"] not in [x["id"] for x in rest] and len(rest) == 2


def test_activity_log_admin_only(client):
    assert client.get("/api/activity-log", headers=H("masaya")).status_code == 403
    assert client.get("/api/activity-log", headers=H("admin")).status_code == 200


def test_activity_log_live_only_to_admins():
    import asyncio

    import live

    member_q: asyncio.Queue = asyncio.Queue()
    admin_q: asyncio.Queue = asyncio.Queue()
    live._subscribers[member_q] = (False, "Kyosei")
    live._subscribers[admin_q] = (True, "Admin")
    try:
        live.publish("activity_log", "INSERT", {"id": "1"}, admin_only=True)
        live.publish("tasks", "INSERT", {"id": "2"})
        assert member_q.qsize() == 1 and admin_q.qsize() == 2
    finally:
        live._subscribers.pop(member_q, None)
        live._subscribers.pop(admin_q, None)


def test_desktop_notify_only_to_member(client):
    """Windows版向け: 担当になった本人の接続にだけ通知が届く（VAPID未設定でも）"""
    import asyncio
    import json

    import live

    mine: asyncio.Queue = asyncio.Queue()
    other: asyncio.Queue = asyncio.Queue()
    live._subscribers[mine] = (False, "Kyosei")
    live._subscribers[other] = (False, "Masaya")
    try:
        r = client.post("/api/tasks", headers=H("masaya"), json={"title": "見積もり", "assignee_name": "Kyosei"})
        assert r.status_code == 201
        msgs = [json.loads(mine.get_nowait()) for _ in range(mine.qsize())]
        notes = [m for m in msgs if m["table"] == "_notify"]
        assert len(notes) == 1 and "見積もり" in notes[0]["row"]["body"]
        assert all(json.loads(other.get_nowait())["table"] != "_notify" for _ in range(other.qsize()))

        assert client.post("/api/push/test", headers=H("masaya")).json() == {"sent": 0, "desktop": 1}
    finally:
        live._subscribers.pop(mine, None)
        live._subscribers.pop(other, None)


def test_item_history_records_field_changes(client):
    ev = client.post(
        "/api/events",
        headers=H("masaya"),
        json={"title": "現地視察会", "start_time": "2026-12-01T01:00:00+00:00", "location": "学内"},
    ).json()
    # 変わっていない項目は記録しない
    client.patch(f"/api/events/{ev['id']}", headers=H("masaya"), json={"location": "学内"})
    client.patch(
        f"/api/events/{ev['id']}",
        headers=H("masaya"),
        json={"location": "浪江町", "start_time": "2026-12-02T01:00:00+00:00", "checklist": []},
    )
    assert client.get(f"/api/history/events/{ev['id']}", headers=H("masaya")).status_code == 403
    rows = client.get(f"/api/history/events/{ev['id']}", headers=H("admin")).json()
    edits = [r for r in rows if r["action"] == "edit"]
    assert len(edits) == 1
    changes = {c["label"]: (c["from"], c["to"]) for c in edits[0]["meta"]["changes"]}
    assert changes == {"開始": ("12/1 10:00", "12/2 10:00"), "場所": ("学内", "浪江町")}
    assert edits[0]["actor"] == "Masaya"

    assert client.get("/api/history/tasks/x", headers=H("admin")).status_code == 404
