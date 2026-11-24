"""
ゴミ箱（Stage16）。

削除は deleted_at を入れるソフトデリート。30日を過ぎたものはゴミ箱を開いたときに完全削除する。
"""
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

import activity_log
import live
from auth import Member, current_member, require_admin
from db import get_supabase

logger = logging.getLogger("toloc.trash")

router = APIRouter(prefix="/api/trash", tags=["trash"])

RETENTION_DAYS = 30

# 種別 → (テーブル名, 表示に使う列, 表示名)
KINDS: dict[str, tuple[str, str, str]] = {
    "tasks": ("tasks", "title", "タスク"),
    "events": ("events", "title", "イベント"),
    "test_runs": ("test_runs", "title", "活動ログ"),
    "sticker_surveys": ("sticker_surveys", "title", "シール集計"),
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("")
async def list_trash(supabase=Depends(get_supabase)):
    cutoff = (datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)).isoformat()
    items = []
    for kind, (table, label_col, kind_label) in KINDS.items():
        try:
            supabase.table(table).delete().lt("deleted_at", cutoff).execute()
            res = (
                supabase.table(table)
                .select(f"id,{label_col},deleted_at,deleted_by")
                .not_.is_("deleted_at", "null")
                .order("deleted_at", desc=True)
                .execute()
            )
        except Exception:
            logger.warning("ゴミ箱の取得に失敗: %s", table, exc_info=True)
            continue
        for row in res.data or []:
            items.append(
                {
                    "kind": kind,
                    "kind_label": kind_label,
                    "id": row["id"],
                    "label": row.get(label_col) or "（無題）",
                    "deleted_at": row["deleted_at"],
                    "deleted_by": row.get("deleted_by"),
                }
            )
    items.sort(key=lambda r: r["deleted_at"], reverse=True)
    return {"retention_days": RETENTION_DAYS, "items": items}


@router.post("/{kind}/{item_id}/restore")
async def restore(
    kind: str,
    item_id: str,
    supabase=Depends(get_supabase),
    actor: Member = Depends(current_member),
):
    if kind not in KINDS:
        raise HTTPException(status_code=404, detail="不明な種別です")
    table, label_col, kind_label = KINDS[kind]
    res = (
        supabase.table(table)
        .update({"deleted_at": None, "deleted_by": None})
        .eq("id", item_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="見つかりません（完全削除済みの可能性）")
    row = res.data[0]
    live.publish(table, "INSERT", row)
    await activity_log.record_async(
        actor, kind.rstrip("s"), "restore", f"{kind_label}「{row.get(label_col)}」を復元", item_id
    )
    return row


@router.delete("/{kind}/{item_id}")
async def purge(
    kind: str,
    item_id: str,
    supabase=Depends(get_supabase),
    actor: Member = Depends(current_member),
):
    """1件を完全削除（元に戻せない）。管理者か、削除した本人だけ。"""
    if kind not in KINDS:
        raise HTTPException(status_code=404, detail="不明な種別です")
    table, label_col, kind_label = KINDS[kind]
    rows = (
        supabase.table(table)
        .select(f"id,{label_col},deleted_by")
        .eq("id", item_id)
        .not_.is_("deleted_at", "null")
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(status_code=404, detail="ゴミ箱に見つかりません")
    row = rows[0]
    if not actor.is_admin and row.get("deleted_by") != actor.name:
        raise HTTPException(status_code=403, detail="完全削除できるのは管理者か、削除した本人だけです")
    supabase.table(table).delete().eq("id", item_id).not_.is_("deleted_at", "null").execute()
    await activity_log.record_async(
        actor, kind.rstrip("s"), "purge", f"{kind_label}「{row.get(label_col)}」を完全に削除", item_id
    )
    return {"ok": True}


@router.delete("")
async def empty_trash(supabase=Depends(get_supabase), actor: Member = Depends(require_admin)):
    """ゴミ箱を空にする（完全削除・元に戻せない）。管理者のみ。"""
    deleted = 0
    for table, _label_col, _kind_label in KINDS.values():
        res = supabase.table(table).delete().not_.is_("deleted_at", "null").execute()
        deleted += len(res.data or [])
    await activity_log.record_async(actor, "trash", "empty", f"ゴミ箱を空にしました（{deleted}件）", None)
    return {"deleted": deleted}
