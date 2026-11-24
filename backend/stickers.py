"""
シール集計（色 × 都道府県）。

来場者に「どこから来たか」をシールで貼ってもらう調査を、複数人のスマホで同時に数える。
- 1回の集計（イベント・日ごと）を sticker_surveys に1件作る
- 数は sticker_counts（集計 × 都道府県 × 色）に持つ。加算・取り消しは DB 関数
  sticker_tap / sticker_undo で行い、同時に押しても数がずれないようにする
- 押した記録は sticker_taps に残り、「元に戻す」は本人の直前の1回を取り消す
変更はリアルタイム配信（live）で全員の画面に反映する。
"""
import csv
import io
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator

import activity_log
import live
from auth import Member, current_member
from db import get_supabase
from trash import now_iso

logger = logging.getLogger("toloc.stickers")

router = APIRouter(prefix="/api/stickers", tags=["stickers"])

JST = timezone(timedelta(hours=9))
PAGE = 1000

PREFS: list[tuple[str, str]] = [
    ("北海道", "Hokkaido"), ("青森県", "Aomori"), ("岩手県", "Iwate"), ("宮城県", "Miyagi"),
    ("秋田県", "Akita"), ("山形県", "Yamagata"), ("福島県", "Fukushima"), ("茨城県", "Ibaraki"),
    ("栃木県", "Tochigi"), ("群馬県", "Gunma"), ("埼玉県", "Saitama"), ("千葉県", "Chiba"),
    ("東京都", "Tokyo"), ("神奈川県", "Kanagawa"), ("新潟県", "Niigata"), ("富山県", "Toyama"),
    ("石川県", "Ishikawa"), ("福井県", "Fukui"), ("山梨県", "Yamanashi"), ("長野県", "Nagano"),
    ("岐阜県", "Gifu"), ("静岡県", "Shizuoka"), ("愛知県", "Aichi"), ("三重県", "Mie"),
    ("滋賀県", "Shiga"), ("京都府", "Kyoto"), ("大阪府", "Osaka"), ("兵庫県", "Hyogo"),
    ("奈良県", "Nara"), ("和歌山県", "Wakayama"), ("鳥取県", "Tottori"), ("島根県", "Shimane"),
    ("岡山県", "Okayama"), ("広島県", "Hiroshima"), ("山口県", "Yamaguchi"), ("徳島県", "Tokushima"),
    ("香川県", "Kagawa"), ("愛媛県", "Ehime"), ("高知県", "Kochi"), ("福岡県", "Fukuoka"),
    ("佐賀県", "Saga"), ("長崎県", "Nagasaki"), ("熊本県", "Kumamoto"), ("大分県", "Oita"),
    ("宮崎県", "Miyazaki"), ("鹿児島県", "Kagoshima"), ("沖縄県", "Okinawa"), ("海外", "Overseas"),
]
PREF_NAMES = [p for p, _ in PREFS]

ColorKey = Literal["red", "blue", "yellow", "green", "orange", "purple", "pink", "gray"]
DEFAULT_COLORS = [
    {"key": "red", "label": "赤"},
    {"key": "blue", "label": "青"},
    {"key": "yellow", "label": "黄"},
    {"key": "green", "label": "緑"},
]


class ColorIn(BaseModel):
    key: ColorKey
    label: str = Field(min_length=1, max_length=20)


def _check_colors(v: Optional[list[ColorIn]]) -> Optional[list[ColorIn]]:
    if v is None:
        return v
    if not 1 <= len(v) <= 8:
        raise ValueError("色は1〜8個にしてください")
    if len({c.key for c in v}) != len(v):
        raise ValueError("同じ色が重複しています")
    return v


class SurveyCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    survey_date: Optional[date] = None
    location: Optional[str] = Field(default=None, max_length=200)
    event_id: Optional[str] = None
    colors: Optional[list[ColorIn]] = None

    @field_validator("colors")
    @classmethod
    def _colors(cls, v):
        return _check_colors(v)


class SurveyPatch(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    survey_date: Optional[date] = None
    location: Optional[str] = Field(default=None, max_length=200)
    event_id: Optional[str] = None
    colors: Optional[list[ColorIn]] = None
    status: Optional[Literal["active", "done"]] = None

    @field_validator("colors")
    @classmethod
    def _colors(cls, v):
        return _check_colors(v)


class TapIn(BaseModel):
    pref: str
    color: ColorKey
    # 画面が自分の操作とリアルタイム配信を突き合わせるための目印（任意）
    tap_id: Optional[str] = Field(default=None, max_length=64)


# ---------------------------------------------------------------------------
# 共通
# ---------------------------------------------------------------------------
def _get_survey(supabase, survey_id: str) -> dict:
    rows = supabase.table("sticker_surveys").select("*").eq("id", survey_id).is_("deleted_at", "null").execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="集計が見つかりません")
    return rows[0]


def _update_survey(supabase, survey_id: str, data: dict) -> dict:
    rows = supabase.table("sticker_surveys").update({**data, "updated_at": now_iso()}).eq("id", survey_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="集計が見つかりません")
    live.publish("sticker_surveys", "UPDATE", rows[0])
    return rows[0]


def _counts(supabase, survey_id: Optional[str] = None) -> list[dict]:
    """sticker_counts を全件読む（Supabase は1回に最大1000行のため分けて読む）"""
    out: list[dict] = []
    start = 0
    while True:
        q = supabase.table("sticker_counts").select("*")
        if survey_id:
            q = q.eq("survey_id", survey_id)
        page = q.order("id").range(start, start + PAGE - 1).execute().data or []
        out.extend(page)
        if len(page) < PAGE:
            return out
        start += PAGE


def _color_keys(survey: dict) -> list[str]:
    return [c["key"] for c in (survey.get("colors") or DEFAULT_COLORS)]


def _rpc_rows(res) -> list[dict]:
    data = getattr(res, "data", None)
    if data is None:
        return []
    return data if isinstance(data, list) else [data]


# ---------------------------------------------------------------------------
# 集計
# ---------------------------------------------------------------------------
@router.get("/prefs")
async def prefs():
    return [{"name": p, "romaji": r} for p, r in PREFS]


@router.get("")
async def list_surveys(supabase=Depends(get_supabase)):
    rows = supabase.table("sticker_surveys").select("*").is_("deleted_at", "null").execute().data or []
    totals: dict[str, int] = {}
    for c in _counts(supabase):
        totals[c["survey_id"]] = totals.get(c["survey_id"], 0) + int(c.get("count") or 0)
    for r in rows:
        r["total"] = totals.get(str(r["id"]), 0)
    rows.sort(key=lambda r: (str(r.get("survey_date") or ""), r.get("created_at") or ""), reverse=True)
    return rows


@router.post("", status_code=201)
async def create_survey(payload: SurveyCreate, supabase=Depends(get_supabase), actor: Member = Depends(current_member)):
    data = payload.model_dump(mode="json", exclude_none=True)
    data.setdefault("colors", DEFAULT_COLORS)
    row = (
        supabase.table("sticker_surveys")
        .insert({**data, "status": "active", "created_by": actor.name})
        .execute()
        .data[0]
    )
    live.publish("sticker_surveys", "INSERT", row)
    await activity_log.record_async(actor, "sticker", "create", f"シール集計「{row['title']}」を作成", str(row["id"]))
    return row


@router.get("/{survey_id}")
async def get_survey(survey_id: str, supabase=Depends(get_supabase)):
    survey = _get_survey(supabase, survey_id)
    return {"survey": survey, "counts": _counts(supabase, survey_id)}


@router.patch("/{survey_id}")
async def patch_survey(
    survey_id: str, payload: SurveyPatch, supabase=Depends(get_supabase), actor: Member = Depends(current_member)
):
    before = _get_survey(supabase, survey_id)
    data = payload.model_dump(exclude_unset=True, mode="json")
    for key in ("title", "colors", "status"):
        if key in data and data[key] is None:
            data.pop(key)
    if "colors" in data:
        # 数が入っている色は外せない（数が見えなくなるため）
        used = {c["color"] for c in _counts(supabase, survey_id) if int(c.get("count") or 0) > 0}
        missing = used - {c["key"] for c in data["colors"]}
        if missing:
            raise HTTPException(status_code=400, detail="数が入っている色は外せません")
    if not data:
        raise HTTPException(status_code=400, detail="更新する項目がありません")
    row = _update_survey(supabase, survey_id, data)
    if "status" in data and before.get("status") != row.get("status"):
        done = row["status"] == "done"
        await activity_log.record_async(
            actor, "sticker", "status", f"シール集計「{row['title']}」を{'終了' if done else '再開'}", survey_id
        )
    return row


@router.delete("/{survey_id}", status_code=204)
async def delete_survey(survey_id: str, supabase=Depends(get_supabase), actor: Member = Depends(current_member)):
    survey = _get_survey(supabase, survey_id)
    supabase.table("sticker_surveys").update({"deleted_at": now_iso(), "deleted_by": actor.name}).eq(
        "id", survey_id
    ).execute()
    live.publish("sticker_surveys", "DELETE", {"id": survey_id})
    await activity_log.record_async(
        actor, "sticker", "delete", f"シール集計「{survey['title']}」をゴミ箱へ移動", survey_id
    )
    return None


# ---------------------------------------------------------------------------
# 数える
# ---------------------------------------------------------------------------
@router.post("/{survey_id}/tap")
async def tap(survey_id: str, payload: TapIn, supabase=Depends(get_supabase), actor: Member = Depends(current_member)):
    survey = _get_survey(supabase, survey_id)
    if survey.get("status") == "done":
        raise HTTPException(status_code=409, detail="終了した集計です。再開してから数えてください")
    if payload.pref not in PREF_NAMES:
        raise HTTPException(status_code=400, detail="都道府県が正しくありません")
    if payload.color not in _color_keys(survey):
        raise HTTPException(status_code=400, detail="この集計に無い色です")
    rows = _rpc_rows(
        supabase.rpc(
            "sticker_tap",
            {"p_survey": survey_id, "p_pref": payload.pref, "p_color": payload.color, "p_actor": actor.name},
        ).execute()
    )
    if not rows:
        raise HTTPException(status_code=500, detail="記録できませんでした")
    row = {**rows[0], "tap_id": payload.tap_id}
    live.publish("sticker_counts", "UPDATE", row)
    return row


@router.post("/{survey_id}/undo")
async def undo(survey_id: str, supabase=Depends(get_supabase), actor: Member = Depends(current_member)):
    """自分が最後に押した1回を取り消す"""
    survey = _get_survey(supabase, survey_id)
    if survey.get("status") == "done":
        raise HTTPException(status_code=409, detail="終了した集計です。再開してから操作してください")
    rows = _rpc_rows(supabase.rpc("sticker_undo", {"p_survey": survey_id, "p_actor": actor.name}).execute())
    if not rows:
        raise HTTPException(status_code=404, detail="取り消せる操作がありません")
    live.publish("sticker_counts", "UPDATE", rows[0])
    return rows[0]


@router.post("/{survey_id}/reset")
async def reset(survey_id: str, supabase=Depends(get_supabase), actor: Member = Depends(current_member)):
    """全ての数を0にする（作成者か管理者のみ）"""
    survey = _get_survey(supabase, survey_id)
    if not actor.is_admin and survey.get("created_by") != actor.name:
        raise HTTPException(status_code=403, detail="作成した人か管理者だけがリセットできます")
    supabase.table("sticker_counts").delete().eq("survey_id", survey_id).execute()
    supabase.table("sticker_taps").delete().eq("survey_id", survey_id).execute()
    _update_survey(supabase, survey_id, {})
    live.publish("sticker_counts", "DELETE", {"id": f"reset:{survey_id}", "survey_id": survey_id, "reset": True})
    await activity_log.record_async(actor, "sticker", "reset", f"シール集計「{survey['title']}」をリセット", survey_id)
    return {"ok": True}


# ---------------------------------------------------------------------------
# 書き出し
# ---------------------------------------------------------------------------
def table_rows(survey: dict, counts: list[dict], include_zero: bool = True) -> tuple[list[str], list[list]]:
    colors = survey.get("colors") or DEFAULT_COLORS
    grid: dict[str, dict[str, int]] = {}
    for c in counts:
        grid.setdefault(c["pref"], {})[c["color"]] = int(c.get("count") or 0)
    head = ["都道府県", *[c["label"] for c in colors], "計"]
    rows: list[list] = []
    col_totals = [0] * len(colors)
    for pref in PREF_NAMES:
        vals = [grid.get(pref, {}).get(c["key"], 0) for c in colors]
        total = sum(vals)
        if not include_zero and total == 0:
            continue
        col_totals = [a + b for a, b in zip(col_totals, vals)]
        rows.append([pref, *vals, total])
    rows.append(["合計", *col_totals, sum(col_totals)])
    return head, rows


@router.get("/{survey_id}/csv")
async def export_csv(survey_id: str, include_zero: bool = False, supabase=Depends(get_supabase)):
    survey = _get_survey(supabase, survey_id)
    head, rows = table_rows(survey, _counts(supabase, survey_id), include_zero)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(head)
    writer.writerows(rows)
    stamp = datetime.now(JST).strftime("%Y%m%d")
    return Response(
        content="﻿" + buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="stickers_{stamp}.csv"'},
    )
