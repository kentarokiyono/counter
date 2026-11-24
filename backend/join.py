"""
メンバーの参加申請（Stage23）。新しいメンバーは管理者の許可制。

- 大学アカウントでログインしたがメンバーでない人は、名前を入れて参加を申請する（/api/join）
- メンバーが他の人を追加しようとした場合も、管理者でなければ申請になる（members.add_member）
- 管理者が許可するとメンバーに登録され、その人はそのまま使い始められる
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

import activity_log
import auth
import live
import push
from auth import Applicant, Member, require_admin
from db import get_supabase

logger = logging.getLogger("toloc.join")

router = APIRouter(tags=["join"])


class JoinIn(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    note: Optional[str] = Field(default=None, max_length=300)


class ApproveIn(BaseModel):
    # 申請の名前を直して登録したいとき
    name: Optional[str] = Field(default=None, min_length=1, max_length=50)


def _applicant(request: Request) -> Applicant:
    a = getattr(request.state, "applicant", None)
    if a is None:
        raise HTTPException(status_code=401, detail="ログインが必要です")
    return a


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _member_names(supabase) -> set[str]:
    return {r["name"] for r in supabase.table("members").select("name").execute().data or []}


def _pending(supabase, email: str) -> Optional[dict]:
    rows = supabase.table("member_requests").select("*").eq("email", email).eq("status", "pending").execute().data
    return rows[0] if rows else None


def submit_request(supabase, email: str, name: str, note: Optional[str], requested_by: Optional[str]) -> dict:
    """申請を作る（同じメールの申請中のものがあれば上書き）。管理者に知らせる"""
    name = name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="名前が空です")
    if supabase.table("members").select("id").eq("email", email).execute().data:
        raise HTTPException(status_code=409, detail="このメールアドレスは既にメンバーです")
    if name in _member_names(supabase):
        raise HTTPException(status_code=409, detail="同じ名前のメンバーがいます。名字を付けるなど区別できる名前にしてください")
    data = {"email": email, "name": name, "note": (note or "").strip() or None, "requested_by": requested_by, "status": "pending"}
    existing = _pending(supabase, email)
    if existing:
        row = supabase.table("member_requests").update(data).eq("id", existing["id"]).execute().data[0]
        live.publish("member_requests", "UPDATE", row, admin_only=True)
    else:
        row = supabase.table("member_requests").insert(data).execute().data[0]
        live.publish("member_requests", "INSERT", row, admin_only=True)
        who = f"（{requested_by}さんから）" if requested_by else ""
        for admin in supabase.table("members").select("name,role").eq("role", "admin").execute().data or []:
            push.notify_member_later(admin["name"], "参加リクエスト", f"{name}さんがメンバー登録を申請しました{who}", "/?members=1")
    return row


# ---------------------------------------------------------------------------
# 申請する人（まだメンバーではない）
# ---------------------------------------------------------------------------
@router.get("/api/join")
async def join_status(request: Request, supabase=Depends(get_supabase)):
    a = _applicant(request)
    if supabase.table("members").select("id").eq("email", a.email).execute().data:
        return {"status": "member", "email": a.email}
    rows = supabase.table("member_requests").select("*").eq("email", a.email).execute().data or []
    rows.sort(key=lambda r: r.get("created_at") or "", reverse=True)
    if not rows:
        return {"status": "none", "email": a.email, "name_hint": a.name_hint}
    return {"status": rows[0]["status"], "email": a.email, "name": rows[0]["name"], "name_hint": a.name_hint}


@router.post("/api/join", status_code=201)
async def join(payload: JoinIn, request: Request, supabase=Depends(get_supabase)):
    a = _applicant(request)
    row = submit_request(supabase, a.email, payload.name, payload.note, None)
    return {"status": row["status"], "name": row["name"]}


# ---------------------------------------------------------------------------
# 管理者
# ---------------------------------------------------------------------------
@router.get("/api/member-requests")
async def list_requests(supabase=Depends(get_supabase), _admin: Member = Depends(require_admin)):
    rows = supabase.table("member_requests").select("*").eq("status", "pending").execute().data or []
    return sorted(rows, key=lambda r: r.get("created_at") or "")


def _get_pending(supabase, request_id: str) -> dict:
    rows = supabase.table("member_requests").select("*").eq("id", request_id).execute().data
    if not rows or rows[0]["status"] != "pending":
        raise HTTPException(status_code=404, detail="申請が見つかりません（処理済みの可能性）")
    return rows[0]


@router.post("/api/member-requests/{request_id}/approve")
async def approve(
    request_id: str, payload: ApproveIn, supabase=Depends(get_supabase), actor: Member = Depends(require_admin)
):
    req = _get_pending(supabase, request_id)
    name = (payload.name or req["name"]).strip()
    if name in _member_names(supabase):
        raise HTTPException(status_code=409, detail="同じ名前のメンバーがいます。名前を直して許可してください")
    try:
        member = (
            supabase.table("members").insert({"name": name, "email": req["email"], "role": "member"}).execute().data[0]
        )
    except Exception:
        raise HTTPException(status_code=409, detail="登録できませんでした（名前かメールが重複している可能性）")
    row = (
        supabase.table("member_requests")
        .update({"status": "approved", "name": name, "decided_by": actor.name, "decided_at": _now()})
        .eq("id", request_id)
        .execute()
        .data[0]
    )
    auth.forget_cached_members()
    live.publish("members", "INSERT", member)
    live.publish("member_requests", "UPDATE", row, admin_only=True)
    await activity_log.record_async(actor, "member", "create", f"{name}さんの参加を許可", str(member["id"]))
    return member


@router.post("/api/member-requests/{request_id}/reject")
async def reject(request_id: str, supabase=Depends(get_supabase), actor: Member = Depends(require_admin)):
    req = _get_pending(supabase, request_id)
    row = (
        supabase.table("member_requests")
        .update({"status": "rejected", "decided_by": actor.name, "decided_at": _now()})
        .eq("id", request_id)
        .execute()
        .data[0]
    )
    live.publish("member_requests", "UPDATE", row, admin_only=True)
    await activity_log.record_async(actor, "member", "reject", f"{req['name']}さんの参加申請を見送り", request_id)
    return row
