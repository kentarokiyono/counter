"""
定期実行（Stage17）。

外部のスケジューラ（GitHub Actions など）から X-Cron-Secret ヘッダ付きで呼ぶ。
  POST /api/cron/daily-digest  … 毎朝のリマインドを Discord に送る（?dry_run=true で送らず本文だけ返す）
  GET  /api/cron/ping          … バックエンドを起こしておくための軽い呼び出し
"""
import hmac
import logging
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException

import discord_notifier
import push
from config import get_settings
from db import get_supabase

logger = logging.getLogger("toloc.cron")

router = APIRouter(prefix="/api/cron", tags=["cron"])

JST = timezone(timedelta(hours=9))
WEEKDAYS = "月火水木金土日"
MAX_ITEMS = 8
DISCORD_LIMIT = 1900


def _check(secret: str | None) -> None:
    expected = get_settings().cron_secret
    if not expected:
        raise HTTPException(status_code=404, detail="定期実行は無効です（CRON_SECRET 未設定）")
    if not secret or not hmac.compare_digest(secret, expected):
        raise HTTPException(status_code=401, detail="合言葉が違います")


def _who(name: str | None) -> str:
    if not name:
        return "未割当"
    uid = discord_notifier.resolve_discord_user_id(name)
    return f"<@{uid}>" if uid else name


def _md(d: date) -> str:
    return f"{d.month}/{d.day}（{WEEKDAYS[d.weekday()]}）"


def build_digest(tasks: list[dict], events: list[dict], today: date) -> str | None:
    """毎朝のお知らせ本文。知らせることが無ければ None。"""
    open_tasks = [t for t in tasks if t.get("status") != "done"]
    tomorrow = today + timedelta(days=1)

    def due(t):
        return date.fromisoformat(str(t["due_date"])[:10]) if t.get("due_date") else None

    overdue = sorted([t for t in open_tasks if due(t) and due(t) < today], key=due)
    due_today = [t for t in open_tasks if due(t) == today]
    due_tomorrow = [t for t in open_tasks if due(t) == tomorrow]
    unassigned = [t for t in open_tasks if not t.get("assignee_name")]

    def event_day(e):
        return datetime.fromisoformat(str(e["start_time"]).replace("Z", "+00:00")).astimezone(JST)

    upcoming = sorted(
        [
            e
            for e in events
            if e.get("status") not in ("cancelled", "completed") and today <= event_day(e).date() <= tomorrow
        ],
        key=event_day,
    )

    lines: list[str] = []

    def task_block(title: str, items: list[dict], show_due: bool = False):
        if not items:
            return
        lines.append(f"**{title}（{len(items)}件）**")
        for t in items[:MAX_ITEMS]:
            suffix = f" 期限{due(t).month}/{due(t).day}" if show_due and due(t) else ""
            lines.append(f"・{t['title']} … {_who(t.get('assignee_name'))}{suffix}")
        if len(items) > MAX_ITEMS:
            lines.append(f"・ほか{len(items) - MAX_ITEMS}件")
        lines.append("")

    task_block("期限切れ", overdue, show_due=True)
    task_block("今日まで", due_today)
    task_block("明日まで", due_tomorrow)

    if upcoming:
        lines.append(f"**今日・明日のイベント（{len(upcoming)}件）**")
        for e in upcoming[:MAX_ITEMS]:
            when = event_day(e)
            day = "今日" if when.date() == today else "明日"
            checklist = e.get("checklist") or []
            left = [c["item"] for c in checklist if not c.get("done")]
            prep = f" 準備 {len(checklist) - len(left)}/{len(checklist)}" if checklist else ""
            loc = f" @{e['location']}" if e.get("location") else ""
            people = "、".join(_who(n) for n in (e.get("assignees") or [])) or "担当未定"
            lines.append(f"・{day} {when:%H:%M} {e['title']}{loc}{prep} … {people}")
            if left:
                lines.append(f"　未準備: {'、'.join(left[:6])}{' ほか' if len(left) > 6 else ''}")
        lines.append("")

    if unassigned:
        lines.append(f"未割当のタスクが{len(unassigned)}件あります。")

    if not lines:
        return None

    header = f"**おはようございます。{_md(today)}のお知らせ**"
    body = header + "\n\n" + "\n".join(lines).strip()
    if len(body) > DISCORD_LIMIT:
        body = body[: DISCORD_LIMIT - 20] + "\n…（以下省略）"
    return body


async def push_personal_digest(tasks: list[dict], today: date) -> None:
    """担当者ごとに「期限切れ・今日まで」の件数をスマホへ通知する。"""
    per: dict[str, list[int]] = {}
    for t in tasks:
        if t.get("status") == "done" or not t.get("assignee_name") or not t.get("due_date"):
            continue
        d = date.fromisoformat(str(t["due_date"])[:10])
        if d <= today:
            c = per.setdefault(t["assignee_name"], [0, 0])
            c[0 if d < today else 1] += 1
    for name, (over, now) in per.items():
        parts = [f"期限切れ{over}件"] if over else []
        if now:
            parts.append(f"今日まで{now}件")
        await push.notify_member(name, "今日のタスク", "・".join(parts), "/tasks")


@router.post("/daily-digest")
async def daily_digest(
    dry_run: bool = False,
    x_cron_secret: str | None = Header(default=None),
    supabase=Depends(get_supabase),
):
    _check(x_cron_secret)
    today = datetime.now(JST).date()
    tasks = supabase.table("tasks").select("*").is_("deleted_at", "null").execute().data or []
    events = supabase.table("events").select("*").is_("deleted_at", "null").execute().data or []
    message = build_digest(tasks, events, today)
    if not dry_run:
        await push_personal_digest(tasks, today)
    if message is None:
        return {"sent": False, "reason": "知らせることがありません", "message": None}
    if dry_run:
        return {"sent": False, "message": message}
    sent = await discord_notifier.send_webhook_message(message)
    return {"sent": sent, "message": message}


@router.get("/ping")
async def ping(x_cron_secret: str | None = Header(default=None), supabase=Depends(get_supabase)):
    """起こす＋DBに触る（Supabase 無料プランは1週間アクセスが無いと一時停止されるため）。"""
    _check(x_cron_secret)
    supabase.table("members").select("id").limit(1).execute()
    return {"ok": True}


# 外部キーの順番（親 → 子）。restore_backup.py もこの順で書き戻す
BACKUP_TABLES = [
    "members", "tasks", "task_comments", "events", "checklist_templates", "activity_log", "work_sessions",
    "test_runs", "test_run_work", "test_run_logs", "member_requests",
    "sticker_surveys", "sticker_counts", "sticker_taps",
]
PAGE = 1000  # Supabase は1回に最大1000行しか返さないため、ページに分けて全件読む


def _read_all(supabase, table: str) -> list:
    rows: list = []
    start = 0
    while True:
        page = supabase.table(table).select("*").order("id").range(start, start + PAGE - 1).execute().data or []
        rows.extend(page)
        if len(page) < PAGE:
            return rows
        start += PAGE


@router.get("/backup")
async def backup(x_cron_secret: str | None = Header(default=None), supabase=Depends(get_supabase)):
    """全テーブルの中身を JSON で返す（GitHub Actions が毎週保存する）。"""
    _check(x_cron_secret)
    out: dict = {"created_at": datetime.now(JST).isoformat(), "tables": {}}
    for t in BACKUP_TABLES:
        try:
            out["tables"][t] = _read_all(supabase, t)
        except Exception:
            logger.warning("バックアップ: %s を読めませんでした", t, exc_info=True)
            out["tables"][t] = None
    return out
