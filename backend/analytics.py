"""
タスク・イベントの統計集計API。

Stage8スコープ:
  - GET /api/analytics/summary: タスク/イベントの件数・ステータス別内訳・完了率等を1回で返す
  - 集計はPython側で行う（Supabase Python clientでの複雑な集計クエリより、
    件数規模が小さいチーム利用を前提にシンプルさを優先した設計判断）

Stage9以降で追加予定:
  - 期間指定（週次/月次）の推移グラフ用データ
  - メンバー別の稼働統計（work_sessions/presenceテーブル導入後）
  - MCPツール呼び出し統計
"""
import logging
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from db import get_supabase
from domains import DOMAINS as TASK_DOMAINS

logger = logging.getLogger("toloc.analytics")

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

TASK_STATUSES = ["todo", "in_progress", "review", "done"]
EVENT_STATUSES = ["planned", "confirmed", "in_progress", "completed", "cancelled"]


class TaskSummary(BaseModel):
    total: int
    by_status: dict[str, int]
    by_domain: dict[str, int]
    completion_rate: float  # 0.0〜1.0
    overdue_count: int


class EventSummary(BaseModel):
    total: int
    by_status: dict[str, int]
    upcoming_count: int  # 開始時刻が現在以降のイベント数


class AnalyticsSummary(BaseModel):
    tasks: TaskSummary
    events: EventSummary
    generated_at: str


def _parse_due_date(value) -> Optional[date]:
    if not value:
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _parse_datetime(value) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    try:
        # SupabaseはZ表記/オフセット付きのISO文字列を返す
        text = str(value).replace("Z", "+00:00")
        dt = datetime.fromisoformat(text)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return None


def _summarize_tasks(rows: list[dict]) -> TaskSummary:
    by_status = {s: 0 for s in TASK_STATUSES}
    by_domain = {d: 0 for d in TASK_DOMAINS}
    today = datetime.now(timezone.utc).date()
    overdue = 0

    for row in rows:
        status = row.get("status")
        if status in by_status:
            by_status[status] += 1

        domain = row.get("domain")
        if domain in by_domain:
            by_domain[domain] += 1

        due = _parse_due_date(row.get("due_date"))
        if due is not None and due < today and status != "done":
            overdue += 1

    total = len(rows)
    done = by_status.get("done", 0)
    completion_rate = (done / total) if total > 0 else 0.0

    return TaskSummary(
        total=total,
        by_status=by_status,
        by_domain=by_domain,
        completion_rate=round(completion_rate, 4),
        overdue_count=overdue,
    )


def _summarize_events(rows: list[dict]) -> EventSummary:
    by_status = {s: 0 for s in EVENT_STATUSES}
    now = datetime.now(timezone.utc)
    upcoming = 0

    for row in rows:
        status = row.get("status")
        if status in by_status:
            by_status[status] += 1

        start = _parse_datetime(row.get("start_time"))
        if start is not None and start >= now:
            upcoming += 1

    return EventSummary(
        total=len(rows),
        by_status=by_status,
        upcoming_count=upcoming,
    )


@router.get("/summary", response_model=AnalyticsSummary)
async def get_summary(supabase=Depends(get_supabase)):
    try:
        tasks_result = supabase.table("tasks").select("*").is_("deleted_at", "null").execute()
    except Exception:
        logger.exception("タスク集計用データ取得失敗")
        raise HTTPException(status_code=502, detail="タスクデータの取得に失敗しました")

    try:
        events_result = supabase.table("events").select("*").is_("deleted_at", "null").execute()
    except Exception:
        logger.exception("イベント集計用データ取得失敗")
        raise HTTPException(status_code=502, detail="イベントデータの取得に失敗しました")

    return AnalyticsSummary(
        tasks=_summarize_tasks(tasks_result.data),
        events=_summarize_events(events_result.data),
        generated_at=datetime.now(timezone.utc).isoformat(),
    )
