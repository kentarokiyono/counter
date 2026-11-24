"""
項目ごとの変更履歴（イベント）。

更新時に変わった項目を「変更前 → 変更後」で activity_log.meta.changes に残し、
項目の画面から一覧できるようにする。閲覧は「最近の動き」と同じく管理者のみ。
"""
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Optional

from fastapi import APIRouter, Depends, HTTPException

from auth import Member, require_admin
from db import get_supabase

router = APIRouter(prefix="/api/history", tags=["history"])

JST = timezone(timedelta(hours=9))
KINDS = {"events": "event"}
MAX_TEXT = 80


def _dt(v: Any) -> str:
    try:
        d = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except ValueError:
        return str(v)
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    d = d.astimezone(JST)
    return f"{d.month}/{d.day} {d.hour:02d}:{d.minute:02d}"


def _text(v: Any) -> str:
    s = str(v).replace("\n", " ")
    return s if len(s) <= MAX_TEXT else s[: MAX_TEXT - 1] + "…"


def _fmt(v: Any, fmt: Optional[Callable[[Any], str]]) -> str:
    if v is None or v == "" or v == []:
        return "（なし）"
    if fmt:
        return fmt(v)
    if isinstance(v, bool):
        return "あり" if v else "なし"
    if isinstance(v, list):
        return _text("、".join(map(str, v)))
    return _text(v)


def _same(a: Any, b: Any, fmt: Optional[Callable[[Any], str]]) -> bool:
    if fmt is _dt and a and b:
        return _dt(a) == _dt(b)
    return (a or None) == (b or None)


EVENT_FIELDS: dict[str, tuple[str, Optional[Callable[[Any], str]]]] = {
    "title": ("タイトル", None),
    "start_time": ("開始", _dt),
    "end_time": ("終了", _dt),
    "location": ("場所", None),
    "assignees": ("担当", None),
    "description": ("説明", None),
}


def diff(before: dict, after: dict, fields: dict[str, tuple[str, Optional[Callable[[Any], str]]]]) -> list[dict]:
    """変わった項目だけを [{field, label, from, to}] で返す"""
    out = []
    for key, (label, fmt) in fields.items():
        if key not in after:
            continue
        a, b = before.get(key), after.get(key)
        if _same(a, b, fmt):
            continue
        out.append({"field": key, "label": label, "from": _fmt(a, fmt), "to": _fmt(b, fmt)})
    return out


def summary(kind_label: str, name: str, changes: list[dict]) -> str:
    return f"{kind_label}「{name}」の{'・'.join(c['label'] for c in changes)}を変更"


@router.get("/{kind}/{target_id}")
async def item_history(kind: str, target_id: str, supabase=Depends(get_supabase), _admin: Member = Depends(require_admin)):
    if kind not in KINDS:
        raise HTTPException(status_code=404, detail="不明な種別です")
    res = (
        supabase.table("activity_log")
        .select("id,created_at,actor,action,summary,meta")
        .eq("kind", KINDS[kind])
        .eq("target_id", target_id)
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )
    return res.data or []
