"""
メンバー管理（Stage14 → Stage16でログイン許可リストを兼ねる）。

members.email に登録されたGoogleアカウントだけがログインできる（auth.py）。
  - 追加: 管理者はそのまま登録。それ以外のメンバーが追加すると参加の申請になり、管理者の許可を待つ（join.py）
  - 削除・権限変更・既存メンバーのメール変更: 管理者のみ
"""
import logging
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import activity_log
import auth
import live
from auth import Member, current_member, require_admin
from config import get_settings
from db import get_supabase

logger = logging.getLogger("toloc.members")

router = APIRouter(prefix="/api/members", tags=["members"])


class MemberCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    email: str = Field(min_length=3, max_length=200)


class MemberUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=50)
    email: Optional[str] = Field(default=None, min_length=3, max_length=200)
    role: Optional[Literal["member", "admin"]] = None


def _normalize_email(email: str) -> str:
    email = email.strip().lower()
    settings = get_settings()
    if "@" not in email:
        raise HTTPException(status_code=400, detail="メールアドレスの形式が正しくありません")
    if not settings.email_allowed(email):
        raise HTTPException(status_code=400, detail=f"{settings.domains_text} のアドレスを指定してください")
    return email


def list_member_names(supabase) -> list[str]:
    """他モジュール（activity）からも使う共通ヘルパー。"""
    res = supabase.table("members").select("name").order("name").execute()
    return [r["name"] for r in (res.data or [])]


@router.get("")
async def list_members(supabase=Depends(get_supabase)):
    res = supabase.table("members").select("*").order("name").execute()
    keys = ("id", "name", "email", "role", "avatar_url")
    return [{k: r.get(k) for k in keys} for r in (res.data or [])]


@router.post("", status_code=201)
async def add_member(
    payload: MemberCreate,
    supabase=Depends(get_supabase),
    actor: Member = Depends(current_member),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="名前が空です")
    email = _normalize_email(payload.email)
    if not actor.is_admin:
        import join

        req = join.submit_request(supabase, email, name, None, actor.name)
        await activity_log.record_async(actor, "member", "request", f"{name}さんの参加を申請", str(req["id"]))
        return {**req, "requested": True}
    try:
        res = (
            supabase.table("members")
            .insert({"name": name, "email": email, "role": "member"})
            .execute()
        )
    except Exception as exc:
        logger.warning("メンバー追加に失敗: %s", exc)
        raise HTTPException(
            status_code=409, detail="追加できませんでした（同じ名前かメールが既に登録されている可能性）"
        )
    row = (res.data or [{}])[0]
    live.publish("members", "INSERT", row)
    await activity_log.record_async(actor, "member", "create", f"メンバー「{name}」を追加", row.get("id"))
    return row


@router.patch("/{member_id}")
async def update_member(
    member_id: str,
    payload: MemberUpdate,
    supabase=Depends(get_supabase),
    actor: Member = Depends(require_admin),
):
    data = payload.model_dump(exclude_unset=True, exclude_none=True)
    if "email" in data:
        data["email"] = _normalize_email(data["email"])
    if "name" in data:
        data["name"] = data["name"].strip()
    if not data:
        raise HTTPException(status_code=400, detail="更新対象のフィールドがありません")
    if data.get("role") == "member" and member_id == actor.id:
        raise HTTPException(status_code=400, detail="自分自身の管理者権限は外せません")
    try:
        res = supabase.table("members").update(data).eq("id", member_id).execute()
    except Exception:
        raise HTTPException(status_code=409, detail="更新できませんでした（名前かメールが重複している可能性）")
    if not res.data:
        raise HTTPException(status_code=404, detail="メンバーが見つかりません")
    auth.forget_cached_members()
    live.publish("members", "UPDATE", res.data[0])
    return res.data[0]


@router.delete("/{member_id}", status_code=204)
async def delete_member(
    member_id: str,
    supabase=Depends(get_supabase),
    actor: Member = Depends(require_admin),
):
    if member_id == actor.id:
        raise HTTPException(status_code=400, detail="自分自身は削除できません")
    res = supabase.table("members").delete().eq("id", member_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="メンバーが見つかりません")
    auth.forget_cached_members()
    live.publish("members", "DELETE", {"id": member_id})
    await activity_log.record_async(
        actor, "member", "delete", f"メンバー「{res.data[0]['name']}」を削除", member_id
    )
    return None


# ---------------------------------------------------------------------------
# 引き継ぎ（卒業・引退するメンバーの担当を別の人に移す）
# ---------------------------------------------------------------------------


class HandoverIn(BaseModel):
    to: Optional[str] = Field(default=None, max_length=50)  # None なら「未割当」に戻す


def _member_name(supabase, member_id: str) -> str:
    rows = supabase.table("members").select("id,name").eq("id", member_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="メンバーが見つかりません")
    return rows[0]["name"]


def _open_items(supabase, name: str) -> dict:
    """未完了でこの人が担当しているもの"""
    tasks = [
        t
        for t in supabase.table("tasks").select("id,title,status,assignee_name,deleted_at").execute().data or []
        if t.get("assignee_name") == name and t.get("status") != "done" and not t.get("deleted_at")
    ]
    events = [
        e
        for e in supabase.table("events").select("id,title,status,assignees,deleted_at").execute().data or []
        if name in (e.get("assignees") or [])
        and e.get("status") not in ("completed", "cancelled")
        and not e.get("deleted_at")
    ]
    return {"tasks": tasks, "events": events}


@router.get("/{member_id}/handover")
async def handover_preview(member_id: str, supabase=Depends(get_supabase), _admin: Member = Depends(require_admin)):
    name = _member_name(supabase, member_id)
    items = _open_items(supabase, name)
    return {
        "name": name,
        "tasks": [{"id": t["id"], "title": t["title"]} for t in items["tasks"]],
        "events": [{"id": e["id"], "title": e["title"]} for e in items["events"]],
    }


@router.post("/{member_id}/handover")
async def handover(
    member_id: str,
    payload: HandoverIn,
    supabase=Depends(get_supabase),
    actor: Member = Depends(require_admin),
):
    name = _member_name(supabase, member_id)
    to = (payload.to or "").strip() or None
    if to == name:
        raise HTTPException(status_code=400, detail="同じ人には引き継げません")
    if to and to not in list_member_names(supabase):
        raise HTTPException(status_code=400, detail="引き継ぎ先がメンバーにいません")
    items = _open_items(supabase, name)
    for t in items["tasks"]:
        row = supabase.table("tasks").update({"assignee_name": to}).eq("id", t["id"]).execute().data
        if row:
            live.publish("tasks", "UPDATE", row[0])
    for e in items["events"]:
        names = [n for n in (e.get("assignees") or []) if n != name]
        if to and to not in names:
            names.append(to)
        row = supabase.table("events").update({"assignees": names}).eq("id", e["id"]).execute().data
        if row:
            live.publish("events", "UPDATE", row[0])
    counts = {k: len(v) for k, v in items.items()}
    total = sum(counts.values())
    if total:
        await activity_log.record_async(
            actor,
            "member",
            "handover",
            f"{name}さんの担当{total}件を{to + 'さん' if to else '未割当'}に引き継ぎ",
            member_id,
        )
    if to and total:
        import push

        push.notify_member_later(to, "担当を引き継ぎました", f"{name}さんの担当{total}件があなたに移りました", "/tasks")
    return counts
