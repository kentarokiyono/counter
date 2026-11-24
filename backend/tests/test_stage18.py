from datetime import date

import pytest

from conftest import H
from cron import build_digest

CRON = {"X-Cron-Secret": "cron-test-secret"}


def test_google_avatar_is_saved(client, fake_db):
    fake_db.auth.users["tok-masaya"] = ("masaya@ecs.osaka-u.ac.jp", {"avatar_url": "https://lh3.example/p.jpg"})
    me = client.get("/api/me", headers=H("masaya")).json()["member"]
    assert me["avatar_url"] == "https://lh3.example/p.jpg"
    m = next(x for x in client.get("/api/members", headers=H("masaya")).json() if x["name"] == "Masaya")
    assert m["avatar_url"] == "https://lh3.example/p.jpg"


def test_attendance(client):
    e = client.post("/api/events", headers=H("masaya"), json={"title": "ブース出展", "start_time": "2026-11-28T00:00:00Z"}).json()
    client.post(f"/api/events/{e['id']}/attendance", headers=H("masaya"), json={"status": "yes"})
    r = client.post(f"/api/events/{e['id']}/attendance", headers=H("kyosei"), json={"status": "no"}).json()
    assert r["attendance"] == {"Masaya": "yes", "Kyosei": "no"}
    r = client.post(f"/api/events/{e['id']}/attendance", headers=H("kyosei"), json={"status": None}).json()
    assert r["attendance"] == {"Masaya": "yes"}


def test_task_checklist_and_comments(client, fake_db):
    t = client.post("/api/tasks", headers=H("masaya"), json={"title": "見積", "assignee_name": "Kyosei", "checklist": [{"item": "3社に依頼"}]}).json()
    assert t["checklist"] == [{"item": "3社に依頼", "done": False}]
    r = client.patch(f"/api/tasks/{t['id']}", headers=H("kyosei"), json={"checklist": [{"item": "3社に依頼", "done": True}]}).json()
    assert r["checklist"][0]["done"] is True
    c = client.post(f"/api/tasks/{t['id']}/comments", headers=H("masaya"), json={"body": "よろしく"}).json()
    assert c["author"] == "Masaya"
    assert [x["body"] for x in client.get(f"/api/tasks/{t['id']}/comments", headers=H("kyosei")).json()] == ["よろしく"]
    assert client.delete(f"/api/task-comments/{c['id']}", headers=H("kyosei")).status_code == 403
    assert client.delete(f"/api/task-comments/{c['id']}", headers=H("masaya")).status_code == 204


def test_templates(client):
    client.post("/api/checklist-templates", headers=H("masaya"), json={"name": "ブース出展", "items": ["テント", " ", "工具"]})
    client.post("/api/checklist-templates", headers=H("masaya"), json={"name": "ブース出展", "items": ["テント"]})
    rows = client.get("/api/checklist-templates", headers=H("masaya")).json()
    assert len(rows) == 1 and rows[0]["items"] == ["テント"]


def test_csv_export(client):
    client.post("/api/tasks", headers=H("masaya"), json={"title": "ポスター作成", "domain": "pr", "status": "review"})
    r = client.get("/api/export/tasks.csv", headers=H("masaya"))
    assert r.status_code == 200 and r.text.startswith("\ufeffタイトル")
    assert "ポスター作成,確認待ち,,広報・SNS" in r.text
    assert client.get("/api/export/sponsors.csv", headers=H("masaya")).status_code == 404
    assert client.get("/api/export/tasks.csv").status_code == 401


def test_backup_and_ping(client):
    client.post("/api/tasks", headers=H("masaya"), json={"title": "A"})
    assert client.get("/api/cron/backup").status_code == 401
    data = client.get("/api/cron/backup", headers=CRON).json()
    assert any(t["title"] == "A" for t in data["tables"]["tasks"]) and data["tables"]["members"]
    assert client.get("/api/cron/ping", headers=CRON).json() == {"ok": True}


def test_server_error_is_reported(client, monkeypatch):
    import alerts
    import export

    sent = []

    async def fake_alert(key, text):
        sent.append(text)
        return True

    monkeypatch.setattr(alerts, "send_alert", fake_alert)
    monkeypatch.setattr(export, "_rows", lambda kind, sb: 1 / 0)
    r = client.get("/api/export/tasks.csv", headers=H("masaya"))
    assert r.status_code == 500 and "管理者に通知" in r.json()["detail"]
    assert sent and "ZeroDivisionError" in sent[0] and "Masaya" in sent[0]


def test_client_error_endpoint_is_public(client, monkeypatch):
    import alerts

    async def fake_alert(key, text):
        return True

    monkeypatch.setattr(alerts, "send_alert", fake_alert)
    r = client.post("/api/client-errors", json={"message": "TypeError: x", "page": "/tasks"})
    assert r.status_code == 200 and r.json()["reported"] is True


def test_backup_reads_past_1000_rows_and_restores(client, fake_db, monkeypatch):
    import copy

    import cron
    import restore_backup

    monkeypatch.setattr(cron, "PAGE", 3)  # 少ない件数でページ分けを確かめる
    for i in range(7):
        client.post("/api/tasks", headers=H("masaya"), json={"title": f"復元テスト{i}"})
    data = client.get("/api/cron/backup", headers=CRON).json()
    titles = {t["title"] for t in data["tables"]["tasks"]}
    assert {f"復元テスト{i}" for i in range(7)} <= titles

    # 消えた状態から戻せること
    before = copy.deepcopy(fake_db.tables["tasks"])
    fake_db.tables["tasks"].clear()
    counts = dict(restore_backup.restore(data, fake_db))
    assert counts["tasks"] == len(before)
    assert {t["id"] for t in fake_db.tables["tasks"]} == {t["id"] for t in before}
    # 確認だけ（client=None）なら書き込まない
    fake_db.tables["tasks"].clear()
    restore_backup.restore(data, None)
    assert fake_db.tables["tasks"] == []


def test_comment_mentions_notify(client, monkeypatch):
    import comments
    import push

    sent = []
    monkeypatch.setattr(push, "notify_member_later", lambda name, title, body, url="/": sent.append((name, title)))
    assert comments.mentioned("@Kyosei と @Noriko、@Kyosei", ["Masaya", "Kyosei", "Noriko"]) == ["Kyosei", "Noriko"]
    assert comments.mentioned("メールは a@b.jp", ["Masaya"]) == []

    t = client.post("/api/tasks", headers=H("masaya"), json={"title": "見積", "assignee_name": "Kyosei"}).json()
    sent.clear()
    client.post(f"/api/tasks/{t['id']}/comments", headers=H("masaya"), json={"body": "@Noriko @Kyosei 確認お願いします @Masaya"})
    # 担当（Kyosei）はメンションとして1回だけ、自分（Masaya）には送らない
    assert sorted(sent) == [("Kyosei", "Masayaさんからのメンション"), ("Noriko", "Masayaさんからのメンション")]
    sent.clear()
    client.post(f"/api/tasks/{t['id']}/comments", headers=H("masaya"), json={"body": "了解"})
    assert sent == [("Kyosei", "Masayaさんがコメント")]


def test_search_comments(client):
    t = client.post("/api/tasks", headers=H("masaya"), json={"title": "見積"}).json()
    gone = client.post("/api/tasks", headers=H("masaya"), json={"title": "消す"}).json()
    client.post(f"/api/tasks/{t['id']}/comments", headers=H("masaya"), json={"body": "ＡＢＣ商事に依頼済み"})
    client.post(f"/api/tasks/{gone['id']}/comments", headers=H("masaya"), json={"body": "abc 別件"})
    client.delete(f"/api/tasks/{gone['id']}", headers=H("masaya"))
    hits = client.get("/api/search/comments", params={"q": "abc"}, headers=H("kyosei")).json()
    # 全角・半角や大文字小文字の違いを無視し、ゴミ箱のタスクのコメントは出さない
    assert [(h["task_title"], h["body"]) for h in hits] == [("見積", "ＡＢＣ商事に依頼済み")]
