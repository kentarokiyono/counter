from conftest import H


def _create(client, who="masaya", **kw):
    r = client.post("/api/stickers", headers=H(who), json={"title": "道の駅なみえ 来場者調査", **kw})
    assert r.status_code == 201, r.text
    return r.json()


def _tap(client, sid, pref, color, who="masaya"):
    return client.post(f"/api/stickers/{sid}/tap", headers=H(who), json={"pref": pref, "color": color})


def test_create_defaults_and_list_total(client):
    s = _create(client, survey_date="2026-12-01", location="浪江町")
    assert [c["key"] for c in s["colors"]] == ["red", "blue", "yellow", "green"] and s["status"] == "active"
    _tap(client, s["id"], "福島県", "red")
    _tap(client, s["id"], "東京都", "blue", who="kyosei")
    rows = client.get("/api/stickers", headers=H("kyosei")).json()
    assert rows[0]["id"] == s["id"] and rows[0]["total"] == 2
    assert len(client.get("/api/stickers/prefs", headers=H("masaya")).json()) == 48


def test_tap_counts_and_validation(client):
    sid = _create(client)["id"]
    first = client.post(f"/api/stickers/{sid}/tap", headers=H("masaya"), json={"pref": "福島県", "color": "red", "tap_id": "t-1"}).json()
    assert first["count"] == 1 and first["tap_id"] == "t-1"
    assert _tap(client, sid, "福島県", "red", who="kyosei").json()["count"] == 2
    assert _tap(client, sid, "海外", "green").json()["count"] == 1
    assert _tap(client, sid, "ふくしま", "red").status_code == 400
    assert _tap(client, sid, "福島県", "purple").status_code == 400  # この集計に無い色
    assert _tap(client, sid, "福島県", "black").status_code == 422
    d = client.get(f"/api/stickers/{sid}", headers=H("masaya")).json()
    grid = {(c["pref"], c["color"]): c["count"] for c in d["counts"]}
    assert grid == {("福島県", "red"): 2, ("海外", "green"): 1}


def test_undo_only_own_last_tap(client):
    sid = _create(client)["id"]
    _tap(client, sid, "福島県", "red")
    _tap(client, sid, "東京都", "blue", who="kyosei")
    _tap(client, sid, "宮城県", "yellow")
    r = client.post(f"/api/stickers/{sid}/undo", headers=H("masaya")).json()
    assert (r["pref"], r["color"], r["count"]) == ("宮城県", "yellow", 0)
    r = client.post(f"/api/stickers/{sid}/undo", headers=H("masaya")).json()
    assert (r["pref"], r["count"]) == ("福島県", 0)
    assert client.post(f"/api/stickers/{sid}/undo", headers=H("masaya")).status_code == 404
    # 他の人の分は残る
    d = client.get(f"/api/stickers/{sid}", headers=H("masaya")).json()
    assert {(c["pref"], c["count"]) for c in d["counts"] if c["count"]} == {("東京都", 1)}


def test_done_blocks_tap_and_reopen(client):
    sid = _create(client)["id"]
    client.patch(f"/api/stickers/{sid}", headers=H("masaya"), json={"status": "done"})
    assert _tap(client, sid, "福島県", "red").status_code == 409
    client.patch(f"/api/stickers/{sid}", headers=H("masaya"), json={"status": "active"})
    assert _tap(client, sid, "福島県", "red").status_code == 200


def test_colors_edit_rules(client):
    sid = _create(client, colors=[{"key": "red", "label": "10代"}, {"key": "blue", "label": "20代"}])["id"]
    _tap(client, sid, "福島県", "red")
    bad = client.patch(f"/api/stickers/{sid}", headers=H("masaya"), json={"colors": [{"key": "blue", "label": "20代"}]})
    assert bad.status_code == 400  # 数が入っている色は外せない
    dup = client.patch(f"/api/stickers/{sid}", headers=H("masaya"), json={"colors": [{"key": "red", "label": "a"}, {"key": "red", "label": "b"}]})
    assert dup.status_code == 422
    ok = client.patch(
        f"/api/stickers/{sid}", headers=H("masaya"),
        json={"colors": [{"key": "red", "label": "10代以下"}, {"key": "orange", "label": "30代"}]},
    ).json()
    assert [c["label"] for c in ok["colors"]] == ["10代以下", "30代"]


def test_reset_permissions(client, fake_db):
    sid = _create(client)["id"]
    _tap(client, sid, "福島県", "red")
    assert client.post(f"/api/stickers/{sid}/reset", headers=H("kyosei")).status_code == 403
    assert client.post(f"/api/stickers/{sid}/reset", headers=H("masaya")).status_code == 200
    assert client.get(f"/api/stickers/{sid}", headers=H("masaya")).json()["counts"] == []
    assert fake_db.tables["sticker_taps"] == []
    assert client.post(f"/api/stickers/{sid}/reset", headers=H("admin")).status_code == 200


def test_csv_and_trash(client):
    sid = _create(client, colors=[{"key": "red", "label": "赤"}, {"key": "blue", "label": "青"}])["id"]
    _tap(client, sid, "福島県", "red")
    _tap(client, sid, "福島県", "blue")
    _tap(client, sid, "北海道", "blue")
    text = client.get(f"/api/stickers/{sid}/csv", headers=H("masaya")).text
    lines = text.lstrip("﻿").strip().splitlines()
    assert lines == ["都道府県,赤,青,計", "北海道,0,1,1", "福島県,1,1,2", "合計,1,2,3"]
    full = client.get(f"/api/stickers/{sid}/csv?include_zero=true", headers=H("masaya")).text
    assert len(full.strip().splitlines()) == 1 + 48 + 1

    assert client.delete(f"/api/stickers/{sid}", headers=H("masaya")).status_code == 204
    assert client.get(f"/api/stickers/{sid}", headers=H("masaya")).status_code == 404
    items = client.get("/api/trash", headers=H("masaya")).json()["items"]
    assert any(i["kind"] == "sticker_surveys" and i["kind_label"] == "シール集計" for i in items)
    assert client.post(f"/api/trash/sticker_surveys/{sid}/restore", headers=H("masaya")).status_code == 200
    assert client.get(f"/api/stickers/{sid}", headers=H("masaya")).status_code == 200


def test_requires_login(client):
    assert client.get("/api/stickers").status_code == 401
