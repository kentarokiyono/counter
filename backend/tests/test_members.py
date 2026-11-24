from conftest import H


def _id(client, name):
    return next(m["id"] for m in client.get("/api/members", headers=H("masaya")).json() if m["name"] == name)


def test_member_add_becomes_request_admin_adds_directly(client, fake_db):
    # 管理者でないメンバーの追加は、管理者の許可待ちの申請になる
    r = client.post("/api/members", headers=H("masaya"), json={"name": "Newbie", "email": "New@ecs.osaka-u.ac.jp"})
    assert r.status_code == 201 and r.json()["requested"] is True
    assert not any(m["name"] == "Newbie" for m in fake_db.tables["members"])
    req = fake_db.tables["member_requests"][0]
    assert req["email"] == "new@ecs.osaka-u.ac.jp" and req["requested_by"] == "Masaya" and req["status"] == "pending"
    # 管理者はそのまま登録できる
    client.get("/api/me", headers=H("admin"))
    r = client.post("/api/members", headers=H("admin"), json={"name": "Direct", "email": "direct@ecs.osaka-u.ac.jp"})
    assert r.status_code == 201 and r.json()["email"] == "direct@ecs.osaka-u.ac.jp" and "requested" not in r.json()


def test_add_rejects_other_domain(client):
    r = client.post("/api/members", headers=H("masaya"), json={"name": "X", "email": "x@gmail.com"})
    assert r.status_code == 400


def test_only_admin_can_delete_or_change_role(client):
    client.get("/api/me", headers=H("admin"))
    noriko = _id(client, "Noriko")
    assert client.delete(f"/api/members/{noriko}", headers=H("masaya")).status_code == 403
    assert client.patch(f"/api/members/{noriko}", headers=H("masaya"), json={"role": "admin"}).status_code == 403
    assert client.patch(f"/api/members/{noriko}", headers=H("admin"), json={"role": "admin"}).json()["role"] == "admin"
    assert client.delete(f"/api/members/{noriko}", headers=H("admin")).status_code == 204


def test_admin_cannot_delete_self(client):
    me = client.get("/api/me", headers=H("admin")).json()["member"]
    assert client.delete(f"/api/members/{me['id']}", headers=H("admin")).status_code == 400


def test_join_request_flow(client, fake_db, monkeypatch):
    import push

    notified = []
    monkeypatch.setattr(push, "notify_member_later", lambda name, title, body, url="/": notified.append((name, title)))
    client.get("/api/me", headers=H("admin"))  # 管理者を登録しておく

    # メンバーでない大学アカウント: 画面は「申請」を出す
    r = client.get("/api/me", headers=H("unregistered"))
    assert r.status_code == 403 and r.json()["code"] == "not_member"
    assert client.get("/api/join", headers=H("unregistered")).json()["status"] == "none"
    # 大学以外のアカウントは申請もできない
    assert client.get("/api/join", headers=H("outside")).status_code == 403
    # 既にいる名前では申請できない
    assert client.post("/api/join", headers=H("unregistered"), json={"name": "Kyosei"}).status_code == 409

    r = client.post("/api/join", headers=H("unregistered"), json={"name": "新人", "note": "電装班"})
    assert r.status_code == 201 and r.json()["status"] == "pending"
    assert notified == [("管理者", "参加リクエスト")]
    # 申請し直しても1件のまま
    client.post("/api/join", headers=H("unregistered"), json={"name": "新人 太郎"})
    assert len(fake_db.tables["member_requests"]) == 1
    assert client.get("/api/join", headers=H("unregistered")).json()["status"] == "pending"

    # 一覧と許可は管理者だけ
    assert client.get("/api/member-requests", headers=H("masaya")).status_code == 403
    reqs = client.get("/api/member-requests", headers=H("admin")).json()
    assert [x["name"] for x in reqs] == ["新人 太郎"]
    rid = reqs[0]["id"]
    assert client.post(f"/api/member-requests/{rid}/approve", headers=H("masaya"), json={}).status_code == 403
    m = client.post(f"/api/member-requests/{rid}/approve", headers=H("admin"), json={"name": "Taro"}).json()
    assert m["name"] == "Taro" and m["email"] == "nobody@ecs.osaka-u.ac.jp"
    # 許可されるとそのまま使える
    assert client.get("/api/me", headers=H("unregistered")).json()["member"]["name"] == "Taro"
    assert client.get("/api/join", headers=H("unregistered")).json()["status"] == "member"
    assert client.post(f"/api/member-requests/{rid}/approve", headers=H("admin"), json={}).status_code == 404


def test_reject_request(client, fake_db):
    client.get("/api/me", headers=H("admin"))
    client.post("/api/join", headers=H("unregistered"), json={"name": "誰か"})
    rid = fake_db.tables["member_requests"][0]["id"]
    assert client.post(f"/api/member-requests/{rid}/reject", headers=H("admin")).json()["status"] == "rejected"
    assert client.get("/api/join", headers=H("unregistered")).json()["status"] == "rejected"
    assert client.get("/api/me", headers=H("unregistered")).status_code == 403
    # 見送られても申請し直せる
    assert client.post("/api/join", headers=H("unregistered"), json={"name": "誰か"}).json()["status"] == "pending"
