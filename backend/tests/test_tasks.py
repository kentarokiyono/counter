from conftest import H


def _create(client, **kw):
    body = {"title": "協賛資料の英訳", **kw}
    r = client.post("/api/tasks", headers=H("masaya"), json=body)
    assert r.status_code == 201
    return r.json()


def test_create_and_log(client):
    t = _create(client, assignee_name="Kyosei")
    log = client.get("/api/activity-log", headers=H("admin")).json()
    assert log[0]["actor"] == "Masaya"
    assert "協賛資料の英訳" in log[0]["summary"] and "Kyosei" in log[0]["summary"]
    assert client.get(f"/api/tasks/{t['id']}", headers=H("masaya")).status_code == 200


def test_patch_null_clears_fields(client):
    t = _create(client, assignee_name="Kyosei", due_date="2026-12-01")
    r = client.patch(f"/api/tasks/{t['id']}", headers=H("masaya"), json={"assignee_name": None, "due_date": None, "title": None})
    assert r.status_code == 200
    body = r.json()
    assert body["assignee_name"] is None and body["due_date"] is None and body["title"] == "協賛資料の英訳"


def test_complete_is_logged(client):
    t = _create(client)
    client.patch(f"/api/tasks/{t['id']}/status", headers=H("kyosei"), json={"status": "done"})
    summaries = [x["summary"] for x in client.get("/api/activity-log", headers=H("admin")).json()]
    assert any("完了" in s for s in summaries)


def test_soft_delete_and_restore(client):
    t = _create(client)
    assert client.delete(f"/api/tasks/{t['id']}", headers=H("masaya")).status_code == 204
    assert all(x["id"] != t["id"] for x in client.get("/api/tasks", headers=H("masaya")).json())
    assert client.get(f"/api/tasks/{t['id']}", headers=H("masaya")).status_code == 404
    assert client.patch(f"/api/tasks/{t['id']}/status", headers=H("masaya"), json={"status": "done"}).status_code == 404
    trash = client.get("/api/trash", headers=H("masaya")).json()["items"]
    assert trash[0]["id"] == t["id"] and trash[0]["deleted_by"] == "Masaya"
    assert client.post(f"/api/trash/tasks/{t['id']}/restore", headers=H("masaya")).status_code == 200
    assert any(x["id"] == t["id"] for x in client.get("/api/tasks", headers=H("masaya")).json())


def test_trash_purges_after_30_days(client, fake_db):
    t = _create(client)
    client.delete(f"/api/tasks/{t['id']}", headers=H("masaya"))
    row = next(r for r in fake_db.tables["tasks"] if r["id"] == t["id"])
    row["deleted_at"] = "2000-01-01T00:00:00+00:00"
    assert client.get("/api/trash", headers=H("masaya")).json()["items"] == []
    assert all(r["id"] != t["id"] for r in fake_db.tables["tasks"])


def test_empty_trash_admin_only(client, fake_db):
    keep = client.post("/api/tasks", headers=H("masaya"), json={"title": "残す"}).json()
    gone = client.post("/api/tasks", headers=H("masaya"), json={"title": "消す"}).json()
    client.delete(f"/api/tasks/{gone['id']}", headers=H("masaya"))
    assert client.delete("/api/trash", headers=H("masaya")).status_code == 403
    r = client.delete("/api/trash", headers=H("admin"))
    assert r.status_code == 200 and r.json()["deleted"] == 1
    assert client.get("/api/trash", headers=H("admin")).json()["items"] == []
    ids = [t["id"] for t in fake_db.tables["tasks"]]
    assert keep["id"] in ids and gone["id"] not in ids


def test_purge_one_by_deleter_or_admin(client, fake_db):
    a = client.post("/api/tasks", headers=H("masaya"), json={"title": "A"}).json()
    b = client.post("/api/tasks", headers=H("masaya"), json={"title": "B"}).json()
    client.delete(f"/api/tasks/{a['id']}", headers=H("masaya"))
    client.delete(f"/api/tasks/{b['id']}", headers=H("masaya"))
    # 削除していない一般メンバーは不可
    assert client.delete(f"/api/trash/tasks/{a['id']}", headers=H("kyosei")).status_code == 403
    assert client.delete(f"/api/trash/tasks/{a['id']}", headers=H("masaya")).status_code == 200
    assert client.delete(f"/api/trash/tasks/{b['id']}", headers=H("admin")).status_code == 200
    assert client.delete(f"/api/trash/tasks/{b['id']}", headers=H("admin")).status_code == 404
    assert fake_db.tables["tasks"] == []
    # ゴミ箱に無いもの（使用中）は消せない
    c = client.post("/api/tasks", headers=H("masaya"), json={"title": "C"}).json()
    assert client.delete(f"/api/trash/tasks/{c['id']}", headers=H("admin")).status_code == 404


def test_repeat_task_spawns_next_on_done(client, fake_db):
    from datetime import date, timedelta

    import task_manager

    assert task_manager.next_due(date(2026, 1, 31), "monthly") == date(2026, 2, 28)
    assert task_manager.next_due(date(2026, 12, 15), "monthly") == date(2027, 1, 15)
    assert task_manager.next_due(date(2026, 3, 2), "weekly") == date(2026, 3, 9)

    due = date.today() + timedelta(days=2)
    t = client.post(
        "/api/tasks",
        headers=H("masaya"),
        json={"title": "定例準備", "repeat": "weekly", "due_date": due.isoformat(), "checklist": [{"item": "議題"}]},
    ).json()
    assert t["repeat"] == "weekly"
    client.patch(f"/api/tasks/{t['id']}", headers=H("masaya"), json={"checklist": [{"item": "議題", "done": True}]})
    client.patch(f"/api/tasks/{t['id']}", headers=H("masaya"), json={"status": "done"})
    rows = [r for r in fake_db.tables["tasks"] if r["title"] == "定例準備"]
    assert len(rows) == 2
    nxt = next(r for r in rows if r["id"] != t["id"])
    assert nxt["due_date"] == (due + timedelta(days=7)).isoformat()
    assert nxt["repeat"] == "weekly" and nxt["checklist"] == [{"item": "議題", "done": False}]
    assert nxt.get("status", "todo") == "todo"
    # 元のタスクは繰り返しを外す: 戻して再度完了にしても増えない
    client.patch(f"/api/tasks/{t['id']}", headers=H("masaya"), json={"status": "todo"})
    client.patch(f"/api/tasks/{t['id']}", headers=H("masaya"), json={"status": "done"})
    assert len([r for r in fake_db.tables["tasks"] if r["title"] == "定例準備"]) == 2

    # 繰り返しなしのタスクは作らない
    u = client.post("/api/tasks", headers=H("masaya"), json={"title": "単発"}).json()
    client.patch(f"/api/tasks/{u['id']}", headers=H("masaya"), json={"status": "done"})
    assert len([r for r in fake_db.tables["tasks"] if r["title"] == "単発"]) == 1


def test_member_handover(client, fake_db):
    kyosei = next(m for m in fake_db.tables["members"] if m["name"] == "Kyosei")
    t1 = client.post("/api/tasks", headers=H("masaya"), json={"title": "残り", "assignee_name": "Kyosei"}).json()
    t2 = client.post("/api/tasks", headers=H("masaya"), json={"title": "済み", "assignee_name": "Kyosei", "status": "done"}).json()
    ev = client.post(
        "/api/events",
        headers=H("masaya"),
        json={"title": "現地視察", "start_time": "2030-01-01T00:00:00+00:00", "assignees": ["Kyosei", "Noriko"]},
    ).json()

    url = f"/api/members/{kyosei['id']}/handover"
    assert client.get(url, headers=H("masaya")).status_code == 403
    pre = client.get(url, headers=H("admin")).json()
    assert [x["title"] for x in pre["tasks"]] == ["残り"]
    assert [x["title"] for x in pre["events"]] == ["現地視察"]

    assert client.post(url, headers=H("admin"), json={"to": "誰か"}).status_code == 400
    assert client.post(url, headers=H("admin"), json={"to": "Noriko"}).json() == {"tasks": 1, "events": 1}
    rows = {r["id"]: r for r in fake_db.tables["tasks"]}
    assert rows[t1["id"]]["assignee_name"] == "Noriko"
    assert rows[t2["id"]]["assignee_name"] == "Kyosei"  # 完了済みはそのまま
    assert next(r for r in fake_db.tables["events"] if r["id"] == ev["id"])["assignees"] == ["Noriko"]
    assert client.get(url, headers=H("admin")).json()["tasks"] == []
