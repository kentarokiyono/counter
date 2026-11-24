"""
タスク作成・割当・ステータス更新のREST API。

Stage2スコープ:
  - CRUD一式（create / list / get / update / update_status / delete）
  - domain・status のバリデーション（schema.sqlのCHECK制約と一致させること）

Stage3スコープ:
  - assignee_name確定時（作成時 or 更新時）にDiscord通知（discord_notifier.py）
  - 通知失敗はログのみで、タスク操作自体は成功として返す（Discord障害でAPIを落とさない）
"""
import logging
import calendar
from datetime import date, timedelta
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import db
from db import get_supabase
import activity_log
import discord_notifier
import live
import push
from auth import Member, current_member
from trash import now_iso
from domains import TaskDomain

logger = logging.getLogger("toloc.task_manager")

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

TaskStatus = Literal["todo", "in_progress", "review", "done"]
# 繰り返し: 完了にすると、次の期限で同じタスクを自動で作る
TaskRepeat = Literal["daily", "weekly", "monthly"]


class TaskChecklistItem(BaseModel):
    item: str = Field(min_length=1, max_length=200)
    done: bool = False


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    status: TaskStatus = "todo"
    assignee_name: Optional[str] = None
    domain: Optional[TaskDomain] = None
    due_date: Optional[date] = None
    checklist: list[TaskChecklistItem] = Field(default_factory=list)
    repeat: Optional[TaskRepeat] = None


class TaskUpdate(BaseModel):
    """PATCH用。送られたフィールドのみ更新する。
    description / assignee_name / domain / due_date は null を送ると値をクリアする。
    title / status は null 不可（null は無視）。"""

    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    assignee_name: Optional[str] = None
    domain: Optional[TaskDomain] = None
    due_date: Optional[date] = None
    checklist: Optional[list[TaskChecklistItem]] = None
    repeat: Optional[TaskRepeat] = None


class TaskStatusUpdate(BaseModel):
    status: TaskStatus


class TaskOut(BaseModel):
    id: UUID
    title: str
    description: Optional[str] = None
    status: TaskStatus
    assignee_name: Optional[str] = None
    domain: Optional[TaskDomain] = None
    due_date: Optional[date] = None
    checklist: list[TaskChecklistItem] = Field(default_factory=list)
    repeat: Optional[TaskRepeat] = None
    created_at: str
    updated_at: str


def _row_to_task_out(row: dict) -> TaskOut:
    return TaskOut(**row)


STATUS_LABELS = {"todo": "ToDo", "in_progress": "進行中", "review": "レビュー", "done": "完了"}


def _fetch_live(supabase, task_id: UUID) -> dict:
    res = (
        supabase.table("tasks")
        .select("*")
        .eq("id", str(task_id))
        .is_("deleted_at", "null")
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="タスクが見つかりません")
    return res.data[0]


def next_due(base: date, repeat: str) -> date:
    if repeat == "daily":
        return base + timedelta(days=1)
    if repeat == "weekly":
        return base + timedelta(days=7)
    # 毎月: 同じ日。無い日（31日など）はその月の末日
    y, m = (base.year + 1, 1) if base.month == 12 else (base.year, base.month + 1)
    return date(y, m, min(base.day, calendar.monthrange(y, m)[1]))


async def _spawn_next(actor: Member, before: dict, after: dict) -> None:
    """繰り返しタスクを完了にしたら、次の回を作る。元のタスクは繰り返しを外す（二重に作らない）"""
    repeat = after.get("repeat")
    if not repeat or before.get("status") == "done" or after.get("status") != "done":
        return
    supabase = db.get_supabase()
    base = date.fromisoformat(str(after["due_date"])[:10]) if after.get("due_date") else date.today()
    due = next_due(base, repeat)
    # 期限を過ぎてから完了した場合も、今日より後になるまで進める
    while due <= date.today():
        due = next_due(due, repeat)
    row = {
        "title": after["title"],
        "description": after.get("description"),
        "assignee_name": after.get("assignee_name"),
        "domain": after.get("domain"),
        "due_date": due.isoformat(),
        "checklist": [{"item": c.get("item"), "done": False} for c in (after.get("checklist") or [])],
        "repeat": repeat,
    }
    try:
        created = supabase.table("tasks").insert({k: v for k, v in row.items() if v is not None}).execute().data[0]
        cleared = supabase.table("tasks").update({"repeat": None}).eq("id", str(after["id"])).execute().data
    except Exception:
        logger.exception("繰り返しタスクの作成に失敗")
        return
    live.publish("tasks", "INSERT", created)
    if cleared:
        live.publish("tasks", "UPDATE", cleared[0])
    await activity_log.record_async(
        actor, "task", "create", f"繰り返しタスク「{created['title']}」の次回（{due.month}/{due.day}）を作成", str(created["id"])
    )


async def _log_changes(actor: Member, before: dict, after: dict) -> None:
    """作成以外で記録するのは「完了」「担当変更」「ステータス変更」。繰り返しタスクの次回もここで作る。"""
    title = after.get("title")
    await _spawn_next(actor, before, after)
    if before.get("status") != after.get("status"):
        if after.get("status") == "done":
            await activity_log.record_async(actor, "task", "complete", f"タスク「{title}」を完了", str(after["id"]))
        else:
            await activity_log.record_async(
                actor,
                "task",
                "status",
                f"タスク「{title}」を{STATUS_LABELS.get(after.get('status'), after.get('status'))}に変更",
                str(after["id"]),
            )
    if before.get("assignee_name") != after.get("assignee_name"):
        who = after.get("assignee_name") or "未割当"
        await activity_log.record_async(actor, "task", "assign", f"タスク「{title}」の担当を{who}に変更", str(after["id"]))
        if after.get("assignee_name") and after["assignee_name"] != actor.name:
            push.notify_member_later(
                after["assignee_name"], "タスクの担当になりました", f"{title}（{actor.name}さんから）", f"/tasks?task={after['id']}"
            )


@router.get("", response_model=list[TaskOut])
async def list_tasks(
    status_filter: Optional[TaskStatus] = None,
    domain: Optional[TaskDomain] = None,
    supabase=Depends(get_supabase),
):
    query = (
        supabase.table("tasks")
        .select("*")
        .is_("deleted_at", "null")
        .order("created_at", desc=True)
    )
    if status_filter is not None:
        query = query.eq("status", status_filter)
    if domain is not None:
        query = query.eq("domain", domain)

    try:
        result = query.execute()
    except Exception:
        logger.exception("タスク一覧取得失敗")
        raise HTTPException(status_code=502, detail="Supabaseへの問い合わせに失敗しました")

    return [_row_to_task_out(row) for row in result.data]


@router.post("", response_model=TaskOut, status_code=201)
async def create_task(
    payload: TaskCreate,
    supabase=Depends(get_supabase),
    actor: Member = Depends(current_member),
):
    try:
        result = (
            supabase.table("tasks")
            .insert({k: v for k, v in payload.model_dump(exclude_none=True, mode="json").items() if v != []})
            .execute()
        )
    except Exception:
        logger.exception("タスク作成失敗")
        raise HTTPException(status_code=502, detail="タスク作成に失敗しました")

    if not result.data:
        raise HTTPException(status_code=502, detail="タスク作成後のレスポンスが空です")

    created = result.data[0]
    live.publish("tasks", "INSERT", created)
    who = f"（担当: {created['assignee_name']}）" if created.get("assignee_name") else ""
    await activity_log.record_async(actor, "task", "create", f"タスク「{created['title']}」を作成{who}", str(created["id"]))
    if created.get("assignee_name") and created["assignee_name"] != actor.name:
        push.notify_member_later(
            created["assignee_name"], "タスクの担当になりました", f"{created['title']}（{actor.name}さんから）", f"/tasks?task={created['id']}"
        )

    if created.get("assignee_name"):
        try:
            await discord_notifier.notify_task_assigned(
                task_title=created["title"],
                assignee_name=created["assignee_name"],
                task_id=str(created["id"]),
            )
        except Exception:
            logger.exception("タスク作成通知（Discord）でエラーが発生しました")

    return _row_to_task_out(created)


@router.get("/{task_id}", response_model=TaskOut)
async def get_task(task_id: UUID, supabase=Depends(get_supabase)):
    try:
        result = (
            supabase.table("tasks")
            .select("*")
            .eq("id", str(task_id))
            .is_("deleted_at", "null")
            .execute()
        )
    except Exception:
        logger.exception("タスク取得失敗")
        raise HTTPException(status_code=502, detail="Supabaseへの問い合わせに失敗しました")

    if not result.data:
        raise HTTPException(status_code=404, detail="タスクが見つかりません")

    return _row_to_task_out(result.data[0])


@router.patch("/{task_id}", response_model=TaskOut)
async def update_task(
    task_id: UUID,
    payload: TaskUpdate,
    supabase=Depends(get_supabase),
    actor: Member = Depends(current_member),
):
    update_data = payload.model_dump(exclude_unset=True, mode="json")
    for key in ("title", "status", "checklist"):
        if update_data.get(key, "") is None:
            update_data.pop(key)
    if not update_data:
        raise HTTPException(status_code=400, detail="更新対象のフィールドがありません")

    before = _fetch_live(supabase, task_id)
    try:
        result = (
            supabase.table("tasks")
            .update(update_data)
            .eq("id", str(task_id))
            .is_("deleted_at", "null")
            .execute()
        )
    except Exception:
        logger.exception("タスク更新失敗")
        raise HTTPException(status_code=502, detail="タスク更新に失敗しました")

    if not result.data:
        raise HTTPException(status_code=404, detail="タスクが見つかりません")

    updated = result.data[0]
    live.publish("tasks", "UPDATE", updated)
    await _log_changes(actor, before, updated)

    # assignee_nameが今回の更新に含まれていた場合のみ通知する
    # （タイトルや期限だけの更新で毎回通知が飛ぶのを避けるため）
    if "assignee_name" in update_data and updated.get("assignee_name"):
        try:
            await discord_notifier.notify_task_assigned(
                task_title=updated["title"],
                assignee_name=updated["assignee_name"],
                task_id=str(updated["id"]),
            )
        except Exception:
            logger.exception("タスク更新通知（Discord）でエラーが発生しました")

    return _row_to_task_out(updated)


@router.patch("/{task_id}/status", response_model=TaskOut)
async def update_task_status(
    task_id: UUID,
    payload: TaskStatusUpdate,
    supabase=Depends(get_supabase),
    actor: Member = Depends(current_member),
):
    """カンバンのドラッグ&ドロップ専用の軽量エンドポイント。"""
    before = _fetch_live(supabase, task_id)
    try:
        result = (
            supabase.table("tasks")
            .update({"status": payload.status})
            .eq("id", str(task_id))
            .is_("deleted_at", "null")
            .execute()
        )
    except Exception:
        logger.exception("タスクステータス更新失敗")
        raise HTTPException(status_code=502, detail="ステータス更新に失敗しました")

    if not result.data:
        raise HTTPException(status_code=404, detail="タスクが見つかりません")

    updated = result.data[0]
    live.publish("tasks", "UPDATE", updated)
    await _log_changes(actor, before, updated)
    return _row_to_task_out(updated)


@router.delete("/{task_id}", status_code=204)
async def delete_task(
    task_id: UUID,
    supabase=Depends(get_supabase),
    actor: Member = Depends(current_member),
):
    """ゴミ箱へ移す（30日間は /api/trash から復元できる）。"""
    try:
        result = (
            supabase.table("tasks")
            .update({"deleted_at": now_iso(), "deleted_by": actor.name})
            .eq("id", str(task_id))
            .is_("deleted_at", "null")
            .execute()
        )
    except Exception:
        logger.exception("タスク削除失敗")
        raise HTTPException(status_code=502, detail="タスク削除に失敗しました")

    if not result.data:
        raise HTTPException(status_code=404, detail="タスクが見つかりません")

    live.publish("tasks", "DELETE", {"id": str(task_id)})
    await activity_log.record_async(actor, "task", "delete", f"タスク「{result.data[0]['title']}」をゴミ箱へ移動", str(task_id))
    return None
