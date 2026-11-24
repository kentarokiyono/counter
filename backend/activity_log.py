"""
「最近の動き」の記録（Stage16）。閲覧は管理者のみ。

誰が・いつ・何をしたかを activity_log に追記する。記録の失敗で本処理を止めない。
kind: task / event / test_run / sticker / member
"""
import asyncio
import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends

import db
import live
from auth import Member, require_admin
from db import get_supabase

logger = logging.getLogger("toloc.activity_log")

router = APIRouter(prefix="/api/activity-log", tags=["activity-log"])


def record(
    actor: Optional[Member],
    kind: str,
    action: str,
    summary: str,
    target_id: Optional[str] = None,
    meta: Optional[dict[str, Any]] = None,
) -> None:
    row = {
        "actor": actor.name if actor else "不明",
        "kind": kind,
        "action": action,
        "summary": summary[:300],
        "target_id": target_id,
        "meta": meta or {},
    }
    try:
        res = db.get_supabase().table("activity_log").insert(row).execute()
        if res.data:
            live.publish("activity_log", "INSERT", res.data[0], admin_only=True)
    except Exception:
        logger.warning("activity_log への記録に失敗しました: %s", summary, exc_info=True)


async def record_async(*args, **kwargs) -> None:
    await asyncio.to_thread(record, *args, **kwargs)


@router.get("")
async def list_activity(
    limit: int = 30,
    actor: Optional[str] = None,
    kind: Optional[str] = None,
    since: Optional[str] = None,
    until: Optional[str] = None,
    before: Optional[str] = None,
    supabase=Depends(get_supabase),
    _admin: Member = Depends(require_admin),
):
    """
    管理者だけが見られる。
    絞り込み: actor（人）/ kind（種類）/ since・until（日付 YYYY-MM-DD、日本時間）。
    before に前ページ最後の created_at を渡すと続きを返す。
    """
    limit = max(1, min(limit, 100))
    try:
        q = supabase.table("activity_log").select("*")
        if actor:
            q = q.eq("actor", actor)
        if kind:
            q = q.eq("kind", kind)
        if since:
            q = q.gte("created_at", f"{since}T00:00:00+09:00")
        if until:
            q = q.lte("created_at", f"{until}T23:59:59.999999+09:00")
        if before:
            q = q.lt("created_at", before)
        res = q.order("created_at", desc=True).limit(limit).execute()
        return res.data or []
    except Exception:
        logger.warning("activity_log の取得に失敗しました（テーブル未作成の可能性）", exc_info=True)
        return []
