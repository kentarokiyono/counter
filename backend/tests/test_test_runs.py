from datetime import datetime, timedelta, timezone

import test_runs
from conftest import H


def _create(client, **kw):
    r = client.post("/api/test-runs", headers=H("masaya"), json={"title": "道の駅ブース出展", **kw})
    assert r.status_code == 201, r.text
    return r.json()


def _iso(minutes_ago: float) -> str:
    return (datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)).isoformat()


def test_create_and_detail(client):
    run = _create(client, run_date="2026-12-01", location="道の駅ならは")
    d = client.get(f"/api/test-runs/{run['id']}", headers=H("kyosei")).json()
    assert [t["name"] for t in d["teams"]] == ["準備", "現地対応", "撤収", "移動"]
    assert d["work"] == [] and d["logs"][0]["title"] == "ログを作成しました" and "server_now" in d


def test_work_start_finish_and_manual(client, fake_db):
    rid = _create(client)["id"]
    w = client.post(f"/api/test-runs/{rid}/work", headers=H("masaya"), json={"team": "prep", "task": "テント設営"}).json()
    assert w["ended_at"] is None
    # 同じ班で並行して別の作業もできる
    client.post(f"/api/test-runs/{rid}/work", headers=H("masaya"), json={"team": "prep", "task": "パネル搬入"})
    row = next(r for r in fake_db.tables["test_run_work"] if r["id"] == w["id"])
    row["started_at"] = _iso(25)
    done = client.patch(f"/api/test-runs/{rid}/work/{w['id']}", headers=H("masaya"), json={"finish": True}).json()
    assert done["ended_at"] is not None
    assert 24 * 60 <= test_runs.work_seconds(done) <= 26 * 60
    # 終了済みをもう一度終了しても変わらない
    again = client.patch(f"/api/test-runs/{rid}/work/{w['id']}", headers=H("masaya"), json={"finish": True}).json()
    assert again["ended_at"] == done["ended_at"]

    # 押し忘れ: 後から開始・終了の時刻を入れる
    m = client.post(
        f"/api/test-runs/{rid}/work",
        headers=H("masaya"),
        json={"team": "onsite", "task": "アンケート受付", "started_at": _iso(90), "ended_at": _iso(60)},
    ).json()
    assert round(test_runs.work_seconds(m)) == 30 * 60
    # 時刻の修正
    fixed = client.patch(f"/api/test-runs/{rid}/work/{m['id']}", headers=H("masaya"), json={"started_at": _iso(100)}).json()
    assert round(test_runs.work_seconds(fixed)) == 40 * 60
    # 終了が開始より前・未来・不明な班は受け付けない
    bad = {"team": "onsite", "task": "x", "started_at": _iso(10), "ended_at": _iso(20)}
    assert client.post(f"/api/test-runs/{rid}/work", headers=H("masaya"), json=bad).status_code == 400
    future = {"team": "onsite", "task": "x", "started_at": _iso(-60)}
    assert client.post(f"/api/test-runs/{rid}/work", headers=H("masaya"), json=future).status_code == 400
    assert client.post(f"/api/test-runs/{rid}/work", headers=H("masaya"), json={"team": "mech", "task": "x"}).status_code == 422

    assert client.delete(f"/api/test-runs/{rid}/work/{m['id']}", headers=H("masaya")).status_code == 204
    titles = [l["title"] for l in client.get(f"/api/test-runs/{rid}", headers=H("masaya")).json()["logs"]]
    assert "準備: テント設営 開始" in titles and "準備: テント設営 終了" in titles
    assert "現地対応: アンケート受付（後から記録）" in titles and "現地対応: アンケート受付 を削除" in titles


def test_delete_goes_to_trash(client):
    rid = _create(client)["id"]
    assert client.delete(f"/api/test-runs/{rid}", headers=H("masaya")).status_code == 204
    assert client.get(f"/api/test-runs/{rid}", headers=H("masaya")).status_code == 404
    assert any(i["kind"] == "test_runs" and i["kind_label"] == "活動ログ" for i in client.get("/api/trash", headers=H("masaya")).json()["items"])
    assert client.post(f"/api/trash/test_runs/{rid}/restore", headers=H("masaya")).status_code == 200


def test_fmt_dur():
    assert test_runs.fmt_dur(309) == "5:09"
    assert test_runs.fmt_dur(3909) == "1:05:09"
