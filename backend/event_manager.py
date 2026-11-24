"""
イベント作成・人員アサイン・持ち物チェックリスト管理のREST API。

Stage7スコープ:
  - CRUD一式（create / list / get / update / delete）
  - assignees確定時（作成時 or 更新時）にDiscord通知（discord_notifier.py、複数担当者を1通にまとめる）
  - checklistはjsonb配列 [{"item": str, "done": bool}, ...] として保持し、
    トグル操作は「チェックリスト全体を含むPATCH」で行う（部分更新用の専用エンドポイントは設けない。
    現状の利用規模ではチェックリストが同時に競合編集される頻度は低いと判断したため）

Stage8以降で追加予定:
  - リマインド通知（開催直前の自動通知）
  - assigneesの正式なユーザー参照化（現状はテキスト配列）
"""
import logging
from datetime import date, datetime
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from db import get_supabase
import activity_log
import history
import discord_notifier
import live
import push
from auth import Member, current_member
from trash import now_iso

logger = logging.getLogger("toloc.event_manager")

router = APIRouter(prefix="/api/events", tags=["events"])

EventStatus = Literal["planned", "confirmed", "in_progress", "completed", "cancelled"]


class ChecklistItem(BaseModel):
    item: str = Field(min_length=1, max_length=200)
    done: bool = False


class EventCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    location: Optional[str] = None
    start_time: datetime
    end_time: Optional[datetime] = None
    status: EventStatus = "planned"
    assignees: list[str] = Field(default_factory=list)
    checklist: list[ChecklistItem] = Field(default_factory=list)


class EventUpdate(BaseModel):
    """PATCH用。指定されたフィールドのみ更新する。"""

    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    location: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    status: Optional[EventStatus] = None
    assignees: Optional[list[str]] = None
    checklist: Optional[list[ChecklistItem]] = None


class EventOut(BaseModel):
    id: UUID
    title: str
    description: Optional[str] = None
    location: Optional[str] = None
    start_time: datetime
    end_time: Optional[datetime] = None
    status: EventStatus
    assignees: list[str]
    checklist: list[ChecklistItem]
    attendance: dict[str, str] = Field(default_factory=dict)
    created_at: str
    updated_at: str


def _row_to_event_out(row: dict) -> EventOut:
    return EventOut(**row)


STATUS_LABELS = {"planned": "予定", "confirmed": "確定", "in_progress": "実施中", "completed": "完了", "cancelled": "中止"}


def _serialize_for_insert(data: dict) -> dict:
    """
    datetime/dateはJSON文字列に、ChecklistItemのリストはdictのリストに変換する。
    Supabaseクライアントはpythonオブジェクトを直接JSONエンコードできないため必須。
    """
    result = {}
    for key, value in data.items():
        if isinstance(value, (datetime, date)):
            result[key] = value.isoformat()
        elif key == "checklist" and value is not None:
            result[key] = [
                item.model_dump() if isinstance(item, ChecklistItem) else item
                for item in value
            ]
        else:
            result[key] = value
    return result


@router.get("", response_model=list[EventOut])
async def list_events(
    status_filter: Optional[EventStatus] = None,
    supabase=Depends(get_supabase),
):
    query = (
        supabase.table("events")
        .select("*")
        .is_("deleted_at", "null")
        .order("start_time", desc=False)
    )
    if status_filter is not None:
        query = query.eq("status", status_filter)

    try:
        result = query.execute()
    except Exception:
        logger.exception("イベント一覧取得失敗")
        raise HTTPException(status_code=502, detail="Supabaseへの問い合わせに失敗しました")

    return [_row_to_event_out(row) for row in result.data]


@router.post("", response_model=EventOut, status_code=201)
async def create_event(
    payload: EventCreate,
    supabase=Depends(get_supabase),
    actor: Member = Depends(current_member),
):
    insert_data = _serialize_for_insert(payload.model_dump())

    try:
        result = supabase.table("events").insert(insert_data).execute()
    except Exception:
        logger.exception("イベント作成失敗")
        raise HTTPException(status_code=502, detail="イベント作成に失敗しました")

    if not result.data:
        raise HTTPException(status_code=502, detail="イベント作成後のレスポンスが空です")

    created = result.data[0]
    live.publish("events", "INSERT", created)
    await activity_log.record_async(actor, "event", "create", f"イベント「{created['title']}」を作成", str(created["id"]))
    for name in created.get("assignees") or []:
        if name != actor.name:
            push.notify_member_later(name, "イベントの担当になりました", created["title"], "/events")

    if created.get("assignees"):
        try:
            await discord_notifier.notify_event_assigned(
                event_title=created["title"],
                assignees=created["assignees"],
                event_id=str(created["id"]),
                start_time=str(created["start_time"]),
            )
        except Exception:
            logger.exception("イベント作成通知（Discord）でエラーが発生しました")

    return _row_to_event_out(created)


@router.get("/{event_id}", response_model=EventOut)
async def get_event(event_id: UUID, supabase=Depends(get_supabase)):
    try:
        result = (
            supabase.table("events")
            .select("*")
            .eq("id", str(event_id))
            .is_("deleted_at", "null")
            .execute()
        )
    except Exception:
        logger.exception("イベント取得失敗")
        raise HTTPException(status_code=502, detail="Supabaseへの問い合わせに失敗しました")

    if not result.data:
        raise HTTPException(status_code=404, detail="イベントが見つかりません")

    return _row_to_event_out(result.data[0])


@router.patch("/{event_id}", response_model=EventOut)
async def update_event(
    event_id: UUID,
    payload: EventUpdate,
    supabase=Depends(get_supabase),
    actor: Member = Depends(current_member),
):
    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="更新対象のフィールドがありません")

    update_data = _serialize_for_insert(update_data)

    prev = supabase.table("events").select("*").eq("id", str(event_id)).execute().data
    before = prev[0] if prev else {}
    before_status = before.get("status")

    try:
        result = (
            supabase.table("events")
            .update(update_data)
            .eq("id", str(event_id))
            .is_("deleted_at", "null")
            .execute()
        )
    except Exception:
        logger.exception("イベント更新失敗")
        raise HTTPException(status_code=502, detail="イベント更新に失敗しました")

    if not result.data:
        raise HTTPException(status_code=404, detail="イベントが見つかりません")

    updated = result.data[0]
    live.publish("events", "UPDATE", updated)
    if "status" in update_data and before_status != updated.get("status"):
        label = STATUS_LABELS.get(updated["status"], updated["status"])
        await activity_log.record_async(
            actor, "event", "status", f"イベント「{updated['title']}」を{label}に変更", str(updated["id"])
        )
    changes = history.diff(before, {k: updated.get(k) for k in update_data}, history.EVENT_FIELDS)
    if changes:
        await activity_log.record_async(
            actor,
            "event",
            "edit",
            history.summary("イベント", updated["title"], changes),
            str(updated["id"]),
            {"changes": changes},
        )

    # assigneesが今回の更新に含まれていた場合のみ通知する
    # （チェックリストのトグルだけの更新で毎回通知が飛ぶのを避けるため）
    if "assignees" in update_data and updated.get("assignees"):
        try:
            await discord_notifier.notify_event_assigned(
                event_title=updated["title"],
                assignees=updated["assignees"],
                event_id=str(updated["id"]),
                start_time=str(updated["start_time"]),
            )
        except Exception:
            logger.exception("イベント更新通知（Discord）でエラーが発生しました")

    return _row_to_event_out(updated)


class AttendanceIn(BaseModel):
    status: Optional[Literal["yes", "no", "maybe"]] = None  # None で回答を取り消す


@router.post("/{event_id}/attendance", response_model=EventOut)
async def set_attendance(
    event_id: UUID,
    payload: AttendanceIn,
    supabase=Depends(get_supabase),
    actor: Member = Depends(current_member),
):
    """ログイン中の本人の出欠を登録する。"""
    res = supabase.table("events").select("*").eq("id", str(event_id)).is_("deleted_at", "null").execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="イベントが見つかりません")
    attendance = dict(res.data[0].get("attendance") or {})
    if payload.status is None:
        attendance.pop(actor.name, None)
    else:
        attendance[actor.name] = payload.status
    updated = (
        supabase.table("events").update({"attendance": attendance}).eq("id", str(event_id)).execute().data[0]
    )
    live.publish("events", "UPDATE", updated)
    return _row_to_event_out(updated)


@router.delete("/{event_id}", status_code=204)
async def delete_event(
    event_id: UUID,
    supabase=Depends(get_supabase),
    actor: Member = Depends(current_member),
):
    """ゴミ箱へ移す（30日間は /api/trash から復元できる）。"""
    try:
        result = (
            supabase.table("events")
            .update({"deleted_at": now_iso(), "deleted_by": actor.name})
            .eq("id", str(event_id))
            .is_("deleted_at", "null")
            .execute()
        )
    except Exception:
        logger.exception("イベント削除失敗")
        raise HTTPException(status_code=502, detail="イベント削除に失敗しました")

    if not result.data:
        raise HTTPException(status_code=404, detail="イベントが見つかりません")

    live.publish("events", "DELETE", {"id": str(event_id)})
    await activity_log.record_async(
        actor, "event", "delete", f"イベント「{result.data[0]['title']}」をゴミ箱へ移動", str(event_id)
    )
    return None
