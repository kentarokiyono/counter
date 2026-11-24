from conftest import H


def test_api_requires_login(client):
    assert client.get("/api/tasks").status_code == 401
    assert client.get("/api/health").status_code == 200


def test_outside_domain_rejected(client):
    r = client.get("/api/me", headers=H("outside"))
    assert r.status_code == 403
    assert "@osaka-u.ac.jp" in r.json()["detail"]


def test_unregistered_rejected(client):
    assert client.get("/api/me", headers=H("unregistered")).status_code == 403


def test_registered_member(client):
    me = client.get("/api/me", headers=H("masaya")).json()["member"]
    assert me["name"] == "Masaya" and me["role"] == "member"


def test_admin_bootstrap(client, fake_db):
    me = client.get("/api/me", headers=H("admin")).json()["member"]
    assert me["role"] == "admin"
    assert any(m["email"] == "kanri@ecs.osaka-u.ac.jp" for m in fake_db.tables["members"])


def test_invalid_token(client):
    assert client.get("/api/me", headers={"Authorization": "Bearer nope"}).status_code == 401


def test_stream_needs_valid_ticket(client):
    assert client.get("/api/realtime/stream?ticket=bad").status_code == 401
    assert client.get("/api/realtime/stream").status_code == 401
    ticket = client.post("/api/auth/ticket", headers=H("masaya")).json()["ticket"]
    assert len(ticket) > 20


def test_deleted_member_loses_access(client):
    client.get("/api/me", headers=H("admin"))
    members = client.get("/api/members", headers=H("admin")).json()
    kyosei = next(m for m in members if m["name"] == "Kyosei")
    assert client.get("/api/me", headers=H("kyosei")).status_code == 200
    assert client.delete(f"/api/members/{kyosei['id']}", headers=H("admin")).status_code == 204
    assert client.get("/api/me", headers=H("kyosei")).status_code == 403


def test_domain_allows_subdomains_only():
    import config

    s = config.Settings(supabase_url="x", supabase_service_role_key="y", allowed_email_domain="osaka-u.ac.jp, @example.org")
    assert s.email_allowed("a@osaka-u.ac.jp") and s.email_allowed("a@ecs.osaka-u.ac.jp")
    assert s.email_allowed("b@EXAMPLE.org")
    assert not s.email_allowed("c@evilosaka-u.ac.jp") and not s.email_allowed("d@osaka-u.ac.jp.evil.com")
    assert config.Settings(supabase_url="x", supabase_service_role_key="y", allowed_email_domain="").email_allowed("e@gmail.com")
