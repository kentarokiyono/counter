"""タスクのコメント（Stage18）。担当者と、本文で @名前 を付けた人に通知する。"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import activity_log
import live
import push
from auth import Member, current_member
from db import get_supabase

logger = logging.getLogger("toloc.comments")

router = APIRouter(tags=["comments"])


class CommentIn(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


def mentioned(body: str, names: list[str]) -> list[str]:
    """本文中の @名前 に当たるメンバー名（長い名前を優先し、重複なし）"""
    found: list[str] = []
    rest = body
    for name in sorted({n for n in names if n}, key=len, reverse=True):
        tag = f"@{name}"
        if tag in rest:
            found.append(name)
            rest = rest.replace(tag, "")
    # 本文に出てきた順
    return sorted(found, key=lambda n: body.index(f"@{n}"))


@router.get("/api/tasks/{task_id}/comments")
async def list_comments(task_id: str, supabase=Depends(get_supabase)):
    try:
        return (
            supabase.table("task_comments").select("*").eq("task_id", task_id).order("created_at").execute().data
            or []
        )
    except Exception:
        logger.warning("task_comments の取得に失敗（テーブル未作成の可能性）", exc_info=True)
        return []


@router.post("/api/tasks/{task_id}/comments", status_code=201)
async def add_comment(
    task_id: str, payload: CommentIn, supabase=Depends(get_supabase), me: Member = Depends(current_member)
):
    task = supabase.table("tasks").select("*").eq("id", task_id).is_("deleted_at", "null").execute().data
    if not task:
        raise HTTPException(status_code=404, detail="タスクが見つかりません")
    row = (
        supabase.table("task_comments")
        .insert({"task_id": task_id, "author": me.name, "body": payload.body.strip()})
        .execute()
        .data[0]
    )
    live.publish("task_comments", "INSERT", row)
    title = task[0]["title"]
    await activity_log.record_async(me, "task", "comment", f"タスク「{title}」にコメント", task_id)
    url = f"/tasks?task={task_id}"
    snippet = f"{title}: {payload.body[:80]}"
    try:
        names = [m["name"] for m in supabase.table("members").select("name").execute().data or []]
    except Exception:
        names = []
    targets = [n for n in mentioned(payload.body, names) if n != me.name]
    for name in targets:
        push.notify_member_later(name, f"{me.name}さんからのメンション", snippet, url)
    assignee = task[0].get("assignee_name")
    if assignee and assignee != me.name and assignee not in targets:
        push.notify_member_later(assignee, f"{me.name}さんがコメント", snippet, url)
    return row


@router.delete("/api/task-comments/{comment_id}", status_code=204)
async def delete_comment(comment_id: str, supabase=Depends(get_supabase), me: Member = Depends(current_member)):
    rows = supabase.table("task_comments").select("*").eq("id", comment_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="コメントが見つかりません")
    if rows[0]["author"] != me.name and not me.is_admin:
        raise HTTPException(status_code=403, detail="自分のコメントだけ削除できます")
    supabase.table("task_comments").delete().eq("id", comment_id).execute()
    live.publish("task_comments", "DELETE", {"id": comment_id, "task_id": rows[0]["task_id"]})
    return None
