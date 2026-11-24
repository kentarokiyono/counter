"""
アクティビティ計測（Stage13）。

「誰が・どれだけの時間触っていて・何を完了/進行中か」を集計するためのAPI。
このアプリはログイン機構が無いため、メンバー名（config/member_discord_map.json）で識別する。

仕組み:
  - クライアントは開いている間、定期的に /api/activity/ping を送る（タブ非表示中は停止）。
  - ping は work_sessions の直近セッションの last_ping_at を更新。一定時間（SESSION_GAP）
    途切れていたら新しいセッションを作る。
  - 稼働時間 = 各セッションの (last_ping_at - started_at) の合計。
  - 在席中 = 直近 ONLINE_WINDOW 以内に ping があるメンバー。
  - 完了/進行中タスク = tasks を assignee_name で集計（担当者がそのタスクを担当している、の意）。
"""
import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import Member, current_member
from db import get_supabase
from members import list_member_names
from domains import DOMAINS

logger = logging.getLogger("toloc.activity")

router = APIRouter(prefix="/api/activity", tags=["activity"])

ONLINE_WINDOW_SEC = 180  # 直近3分 ping があれば在席中
SESSION_GAP_SEC = 300  # 5分以上 ping が途切れたら別セッション扱い

JST = timezone(timedelta(hours=9))  # 日別集計は日本時間の日付境界で行う



def _parse(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


@router.get("/members")
async def list_members(supabase=Depends(get_supabase)):
    """名前一覧（members テーブル由来）。後方互換のため維持。"""
    return {"members": list_member_names(supabase)}


@router.post("/ping")
async def ping(supabase=Depends(get_supabase), me: Member = Depends(current_member)):
    """在席ハートビート（ログイン中の本人として記録）。直近セッションがあれば更新、無ければ新規作成する。"""
    name = me.name

    now = datetime.now(timezone.utc)
    gap_cutoff = (now - timedelta(seconds=SESSION_GAP_SEC)).isoformat()

    existing = (
        supabase.table("work_sessions")
        .select("id")
        .eq("member_name", name)
        .gte("last_ping_at", gap_cutoff)
        .order("last_ping_at", desc=True)
        .limit(1)
        .execute()
    )

    if existing.data:
        supabase.table("work_sessions").update(
            {"last_ping_at": now.isoformat()}
        ).eq("id", existing.data[0]["id"]).execute()
    else:
        supabase.table("work_sessions").insert(
            {
                "member_name": name,
                "started_at": now.isoformat(),
                "last_ping_at": now.isoformat(),
            }
        ).execute()

    return {"ok": True}


@router.get("/online")
async def online(supabase=Depends(get_supabase)):
    """今オンライン（直近3分以内に操作）のメンバー。ホーム画面用の軽量版。"""
    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(seconds=ONLINE_WINDOW_SEC)).isoformat()
    try:
        rows = (
            supabase.table("work_sessions")
            .select("member_name,started_at,last_ping_at")
            .gte("last_ping_at", cutoff)
            .execute()
            .data
            or []
        )
    except Exception:
        logger.warning("work_sessions 取得に失敗", exc_info=True)
        return {"online": []}
    by_name: dict[str, float] = {}
    for r in rows:
        secs = (now - _parse(r["started_at"])).total_seconds()
        by_name[r["member_name"]] = max(by_name.get(r["member_name"], 0.0), secs)
    return {
        "online": [
            {"name": n, "session_seconds": s}
            for n, s in sorted(by_name.items(), key=lambda kv: -kv[1])
        ]
    }


class MemberStat(BaseModel):
    name: str
    online: bool = False
    session_seconds: float = 0  # 在席中の場合、現在のセッションの経過秒
    active_seconds_today: float = 0
    active_seconds_7d: float = 0
    completed_tasks: int = 0
    in_progress_tasks: int = 0


@router.get("/summary")
async def summary(supabase=Depends(get_supabase)):
    now = datetime.now(timezone.utc)
    now_jst = now.astimezone(JST)
    today_start_jst = now_jst.replace(hour=0, minute=0, second=0, microsecond=0)
    today_start = today_start_jst.astimezone(timezone.utc)
    # 直近7日（JST日単位）の各日の開始（JST）。古い順。
    day_starts_jst = [today_start_jst - timedelta(days=i) for i in range(6, -1, -1)]
    week_start = day_starts_jst[0].astimezone(timezone.utc)
    online_cutoff = now - timedelta(seconds=ONLINE_WINDOW_SEC)

    try:
        sessions = (
            supabase.table("work_sessions")
            .select("member_name,started_at,last_ping_at")
            .gte("last_ping_at", week_start.isoformat())
            .execute()
            .data
            or []
        )
    except Exception as exc:
        logger.warning("work_sessions 取得に失敗（テーブル未作成の可能性）: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="work_sessions テーブルが見つかりません。schema.sql を Supabase で実行してください。",
        )

    tasks = (
        supabase.table("tasks")
        .select("assignee_name,status,title,updated_at,domain")
        .is_("deleted_at", "null")
        .execute()
        .data
        or []
    )

    # 既知メンバーを先にシードして、稼働ゼロでも表に出す
    stats: dict[str, dict] = {}

    def bucket(name: str) -> dict:
        return stats.setdefault(
            name,
            {
                "name": name,
                "online": False,
                "session_seconds": 0.0,
                "active_seconds_today": 0.0,
                "active_seconds_7d": 0.0,
                "completed_tasks": 0,
                "in_progress_tasks": 0,
            },
        )

    for name in list_member_names(supabase):
        bucket(name)

    for s in sessions:
        name = s.get("member_name")
        if not name:
            continue
        b = bucket(name)
        st = _parse(s["started_at"])
        lp = _parse(s["last_ping_at"])
        b["active_seconds_7d"] += max(0.0, (lp - st).total_seconds())
        if lp >= today_start:
            eff_start = max(st, today_start)
            b["active_seconds_today"] += max(0.0, (lp - eff_start).total_seconds())
        if lp >= online_cutoff:
            b["online"] = True
            b["session_seconds"] = max(
                b["session_seconds"], (now - st).total_seconds()
            )

    for t in tasks:
        name = t.get("assignee_name")
        if not name:
            continue
        b = bucket(name)
        if t.get("status") == "done":
            b["completed_tasks"] += 1
        elif t.get("status") == "in_progress":
            b["in_progress_tasks"] += 1

    members = sorted(
        stats.values(),
        key=lambda d: (not d["online"], -d["active_seconds_7d"], d["name"]),
    )
    online = [
        {"name": d["name"], "session_seconds": d["session_seconds"]}
        for d in members
        if d["online"]
    ]

    # 直近アクティビティ（タスクの更新順・上位10件）
    recent = sorted(
        [t for t in tasks if t.get("updated_at")],
        key=lambda t: t["updated_at"],
        reverse=True,
    )[:10]
    recent_out = [
        {
            "title": t.get("title"),
            "assignee_name": t.get("assignee_name"),
            "status": t.get("status"),
            "updated_at": t.get("updated_at"),
        }
        for t in recent
    ]

    # --- 日別の稼働時間（分）: セッションを日境界で分割して各日に配分 ---
    def _overlap_seconds(a_start, a_end, b_start, b_end) -> float:
        lo = max(a_start, b_start)
        hi = min(a_end, b_end)
        return max(0.0, (hi - lo).total_seconds())

    daily_activity = []
    for d_jst in day_starts_jst:
        d_start = d_jst.astimezone(timezone.utc)
        d_end = (d_jst + timedelta(days=1)).astimezone(timezone.utc)
        total = 0.0
        for s in sessions:
            total += _overlap_seconds(
                _parse(s["started_at"]), _parse(s["last_ping_at"]), d_start, d_end
            )
        daily_activity.append(
            {"date": f"{d_jst.month}/{d_jst.day}", "minutes": round(total / 60)}
        )

    # --- 日別の完了タスク数（done の updated_at を完了日とみなす） ---
    comp = {f"{d.month}/{d.day}": 0 for d in day_starts_jst}
    for t in tasks:
        if t.get("status") != "done" or not t.get("updated_at"):
            continue
        u = _parse(t["updated_at"]).astimezone(JST)
        key = f"{u.month}/{u.day}"
        if key in comp and u >= day_starts_jst[0]:
            comp[key] += 1
    daily_completions = [
        {"date": f"{d.month}/{d.day}", "count": comp[f"{d.month}/{d.day}"]}
        for d in day_starts_jst
    ]

    # --- メンバー別 業務区分内訳（全ステータスのタスクを domain で数える） ---
    md: dict[str, dict] = {}
    for t in tasks:
        name = t.get("assignee_name")
        dom = t.get("domain")
        if not name or not dom or dom not in DOMAINS:
            continue
        md.setdefault(name, {d: 0 for d in DOMAINS})
        md[name][dom] += 1
    member_domains = []
    for name, counts in md.items():
        row = {"name": name, **counts}
        member_domains.append(row)
    member_domains.sort(
        key=lambda r: -sum(v for k, v in r.items() if k != "name")
    )

    return {
        "generated_at": now.isoformat(),
        "online": online,
        "members": members,
        "recent": recent_out,
        "daily_activity": daily_activity,
        "daily_completions": daily_completions,
        "member_domains": member_domains,
    }
