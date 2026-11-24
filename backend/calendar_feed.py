"""
イベントのカレンダー配信（iCal、Stage17）。

Googleカレンダーの「URLで追加」や iPhone の「照会するカレンダー」に
/api/calendar/feed/<CALENDAR_FEED_TOKEN>.ics を登録すると、イベントが自動で表示される。
URL を知っている人は誰でも見られるので、チーム外に共有しないこと（漏れたら合言葉を変える）。
"""
import hmac
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from auth import Member, current_member
from config import get_settings
from db import get_supabase

router = APIRouter(prefix="/api/calendar", tags=["calendar"])

STATUS_LABELS = {"planned": "予定", "confirmed": "確定", "in_progress": "実施中", "completed": "完了", "cancelled": "中止"}


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def _fold(line: str) -> str:
    """RFC 5545: 1行75オクテットで折り返す（マルチバイト文字の途中では切らない）。"""
    out, cur = [], ""
    for ch in line:
        if len((cur + ch).encode("utf-8")) > 75:
            out.append(cur)
            cur = " " + ch
        else:
            cur += ch
    out.append(cur)
    return "\r\n".join(out)


def _dt(value: str) -> str:
    d = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def build_ics(events: list[dict]) -> str:
    now = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Wakayama Univ Solar Car Team//Control Plane//JA",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:Toloc イベント",
        "X-WR-TIMEZONE:Asia/Tokyo",
    ]
    for e in events:
        start = e["start_time"]
        end = e.get("end_time") or (
            datetime.fromisoformat(str(start).replace("Z", "+00:00")) + timedelta(hours=1)
        ).isoformat()
        desc = [f"状態: {STATUS_LABELS.get(e.get('status'), e.get('status'))}"]
        if e.get("assignees"):
            desc.append("担当: " + "、".join(e["assignees"]))
        if e.get("checklist"):
            done = sum(1 for c in e["checklist"] if c.get("done"))
            desc.append(f"準備: {done}/{len(e['checklist'])}")
        if e.get("description"):
            desc.append(e["description"])
        lines += [
            "BEGIN:VEVENT",
            f"UID:{e['id']}@toloc-os",
            f"DTSTAMP:{now}",
            f"DTSTART:{_dt(start)}",
            f"DTEND:{_dt(end)}",
            _fold("SUMMARY:" + _escape(e["title"])),
        ]
        if e.get("location"):
            lines.append(_fold("LOCATION:" + _escape(e["location"])))
        lines.append(_fold("DESCRIPTION:" + _escape("\n".join(desc))))
        if e.get("status") == "cancelled":
            lines.append("STATUS:CANCELLED")
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"


@router.get("/feed/{token}.ics")
async def feed(token: str, supabase=Depends(get_supabase)):
    expected = get_settings().calendar_feed_token
    if not expected or not hmac.compare_digest(token, expected):
        raise HTTPException(status_code=404, detail="見つかりません")
    events = supabase.table("events").select("*").is_("deleted_at", "null").order("start_time").execute().data or []
    return Response(content=build_ics(events), media_type="text/calendar; charset=utf-8")


@router.get("/feed-url")
async def feed_url(me: Member = Depends(current_member)):
    token = get_settings().calendar_feed_token
    return {"enabled": bool(token), "path": f"/api/calendar/feed/{token}.ics" if token else None}
