"""
CSV 書き出し（Stage18）。Excel で文字化けしないよう UTF-8（BOM付き）で返す。
  /api/export/tasks.csv  /api/export/events.csv
"""
import csv
import io
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from db import get_supabase
from domains import DOMAIN_LABELS as DOMAINS

router = APIRouter(prefix="/api/export", tags=["export"])

JST = timezone(timedelta(hours=9))

TASK_STATUS = {"todo": "未着手", "in_progress": "進行中", "review": "確認待ち", "done": "完了"}
EVENT_STATUS = {"planned": "予定", "confirmed": "確定", "in_progress": "実施中", "completed": "完了", "cancelled": "中止"}


def _jst(value) -> str:
    if not value:
        return ""
    d = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return d.astimezone(JST).strftime("%Y-%m-%d %H:%M")


def _rows(kind: str, supabase) -> tuple[list[str], list[list]]:
    if kind == "tasks":
        data = supabase.table("tasks").select("*").is_("deleted_at", "null").order("created_at").execute().data or []
        head = ["タイトル", "状態", "担当", "分類", "期限", "詳細", "作成日時", "更新日時"]
        rows = [
            [t["title"], TASK_STATUS.get(t["status"], t["status"]), t.get("assignee_name") or "",
             DOMAINS.get(t.get("domain") or "", ""), t.get("due_date") or "", t.get("description") or "",
             _jst(t.get("created_at")), _jst(t.get("updated_at"))]
            for t in data
        ]
        return head, rows
    if kind == "events":
        data = supabase.table("events").select("*").is_("deleted_at", "null").order("start_time").execute().data or []
        head = ["タイトル", "状態", "開始", "終了", "場所", "担当", "参加", "準備", "詳細"]
        rows = []
        for e in data:
            att = e.get("attendance") or {}
            checklist = e.get("checklist") or []
            rows.append([
                e["title"], EVENT_STATUS.get(e["status"], e["status"]), _jst(e.get("start_time")), _jst(e.get("end_time")),
                e.get("location") or "", "、".join(e.get("assignees") or []),
                "、".join(n for n, v in att.items() if v == "yes"),
                f"{sum(1 for c in checklist if c.get('done'))}/{len(checklist)}" if checklist else "",
                e.get("description") or "",
            ])
        return head, rows
    raise HTTPException(status_code=404, detail="不明な種類です")


@router.get("/{kind}.csv")
async def export_csv(kind: str, supabase=Depends(get_supabase)):
    head, rows = _rows(kind, supabase)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(head)
    writer.writerows(rows)
    stamp = datetime.now(JST).strftime("%Y%m%d")
    return Response(
        content="﻿" + buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{kind}_{stamp}.csv"'},
    )
