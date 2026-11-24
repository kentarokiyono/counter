"""
認証（Stage16）。

フロントは Supabase Auth（Google ログイン）でサインインし、アクセストークンを
Authorization: Bearer で送る。backend はトークンを Supabase に照会して本人のメールを確かめ、
members テーブル（email 登録済み）と突き合わせてメンバーを特定する。

  - ドメイン制限: settings.allowed_email_domain（既定 osaka-u.ac.jp。サブドメインも可）
  - 許可リスト: members.email に登録された人だけ（ADMIN_EMAILS は初回ログインで自動登録）
  - SSE（EventSource はヘッダを付けられない）は、POST /api/auth/ticket で発行した
    短期チケットを ?ticket= で渡す。
"""
import asyncio
import hashlib
import logging
import secrets
import time
from dataclasses import dataclass
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

import db
from config import get_settings

logger = logging.getLogger("toloc.auth")

router = APIRouter(prefix="/api", tags=["auth"])

TOKEN_CACHE_SEC = 60
TICKET_TTL_SEC = 600


@dataclass(frozen=True)
class Member:
    id: str
    name: str
    email: str
    role: str  # "member" | "admin"
    avatar_url: Optional[str] = None

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"

    def as_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "role": self.role,
            "avatar_url": self.avatar_url,
        }


DEV_MEMBER = Member(id="dev", name="開発者", email="dev@localhost", role="admin")
# リクエストに紐づかない処理（定期実行など）で使う既定の操作者
SYSTEM_MEMBER = Member(id="system", name="システム", email="", role="member")


class AuthError(Exception):
    def __init__(self, status: int, detail: str, code: Optional[str] = None):
        self.status = status
        self.detail = detail
        # 画面が「参加の申請」を出すための目印（not_member）
        self.code = code


@dataclass
class Applicant:
    """大学アカウントでログインしたが、まだメンバーではない人（参加の申請だけできる）"""

    email: str
    name_hint: str


_token_cache: dict[str, tuple[float, Member]] = {}
_tickets: dict[str, tuple[float, Member]] = {}


def _cache_key(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _lookup_member(supabase, email: str, user_meta: dict) -> Member:
    settings = get_settings()
    email = email.lower()
    if not settings.email_allowed(email):
        raise AuthError(403, f"{settings.domains_text} のアカウントでログインしてください")

    avatar = user_meta.get("avatar_url") or user_meta.get("picture")
    res = supabase.table("members").select("*").eq("email", email).execute()
    if res.data:
        row = res.data[0]
        if avatar and row.get("avatar_url") != avatar:
            # Googleのプロフィール写真を記録（他のメンバーの画面にも出す）
            try:
                supabase.table("members").update({"avatar_url": avatar}).eq("id", row["id"]).execute()
            except Exception:
                logger.debug("avatar_url の更新に失敗（列が未作成の可能性）", exc_info=True)
        return Member(
            id=str(row["id"]),
            name=row["name"],
            email=email,
            role=row.get("role") or "member",
            avatar_url=avatar or row.get("avatar_url"),
        )

    if email in settings.admin_emails_list:
        name = (user_meta.get("full_name") or user_meta.get("name") or email.split("@")[0]).strip()
        try:
            created = (
                supabase.table("members")
                .insert({"name": name, "email": email, "role": "admin"})
                .execute()
            )
        except Exception:
            # 同名メンバーが既にいる場合はメールだけ付け足す
            created = (
                supabase.table("members")
                .update({"email": email, "role": "admin"})
                .eq("name", name)
                .execute()
            )
        if created.data:
            row = created.data[0]
            logger.info("初期管理者を登録しました: %s", name)
            return Member(id=str(row["id"]), name=row["name"], email=email, role="admin", avatar_url=avatar)

    raise AuthError(403, "このアカウントはまだメンバーではありません。参加を申請してください", "not_member")


async def _user_from_token(token: str):
    supabase = db.get_supabase()
    try:
        res = await asyncio.to_thread(supabase.auth.get_user, token)
    except Exception as e:
        # フロントとバックエンドで別のSupabaseプロジェクトを見ている等の原因をログで追えるようにする
        logger.warning("ログインの確認に失敗: %s", e)
        raise AuthError(401, "ログインの有効期限が切れました。再度ログインしてください")
    user = getattr(res, "user", None)
    if user is None or not user.email:
        raise AuthError(401, "ログイン情報を確認できませんでした")
    return user


async def applicant_from_token(token: str) -> Applicant:
    """メンバーかどうかは問わず、大学アカウントであることだけを確かめる（参加の申請用）"""
    user = await _user_from_token(token)
    email = user.email.lower()
    settings = get_settings()
    if not settings.email_allowed(email):
        raise AuthError(403, f"{settings.domains_text} のアカウントでログインしてください")
    meta = user.user_metadata or {}
    return Applicant(email=email, name_hint=(meta.get("full_name") or meta.get("name") or "").strip())


async def member_from_token(token: str) -> Member:
    key = _cache_key(token)
    now = time.monotonic()
    cached = _token_cache.get(key)
    if cached and cached[0] > now:
        return cached[1]

    user = await _user_from_token(token)
    member = await asyncio.to_thread(_lookup_member, db.get_supabase(), user.email, user.user_metadata or {})
    if len(_token_cache) > 1000:
        _token_cache.clear()
    _token_cache[key] = (now + TOKEN_CACHE_SEC, member)
    return member


def forget_cached_members() -> None:
    """メンバー削除・権限変更時に呼ぶ（キャッシュ経由で権限が残らないように）。"""
    _token_cache.clear()
    _tickets.clear()


def issue_ticket(member: Member) -> str:
    now = time.monotonic()
    for k in [k for k, (exp, _) in _tickets.items() if exp <= now]:
        _tickets.pop(k, None)
    ticket = secrets.token_urlsafe(32)
    _tickets[ticket] = (now + TICKET_TTL_SEC, member)
    return ticket


def member_from_ticket(ticket: str) -> Member:
    entry = _tickets.get(ticket)
    if not entry or entry[0] <= time.monotonic():
        raise AuthError(401, "接続チケットの有効期限が切れました")
    return entry[1]


def _is_exempt(request: Request) -> bool:
    path = request.url.path
    return (
        request.method == "OPTIONS"
        or not path.startswith("/api/")
        or path == "/api/health"
    )


def _is_public(request: Request) -> bool:
    """ログイン不要だが、各エンドポイントで別の合言葉を確認するもの。"""
    path = request.url.path
    return (
        path.startswith("/api/cron/")
        or path.startswith("/api/calendar/feed/")
        or (path == "/api/client-errors" and request.method == "POST")
    )


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        if _is_exempt(request):
            return await call_next(request)
        if get_settings().auth_is_disabled:
            request.state.member = DEV_MEMBER
            return await call_next(request)
        if _is_public(request):
            return await call_next(request)
        try:
            header = request.headers.get("authorization", "")
            if header.lower().startswith("bearer ") and request.url.path.startswith("/api/join"):
                # 参加の申請: メンバーでなくても大学アカウントなら使える
                request.state.applicant = await applicant_from_token(header[7:].strip())
            elif header.lower().startswith("bearer "):
                request.state.member = await member_from_token(header[7:].strip())
            elif request.url.path.endswith("/stream") and request.query_params.get("ticket"):
                request.state.member = member_from_ticket(request.query_params["ticket"])
            else:
                raise AuthError(401, "ログインが必要です")
        except AuthError as exc:
            body = {"detail": exc.detail}
            if exc.code:
                body["code"] = exc.code
            return JSONResponse(body, status_code=exc.status)
        except HTTPException as exc:
            return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)
        return await call_next(request)


def current_member(request: Request) -> Member:
    member: Optional[Member] = getattr(request.state, "member", None)
    if member is None:
        raise HTTPException(status_code=401, detail="ログインが必要です")
    return member


def require_admin(request: Request) -> Member:
    member = current_member(request)
    if not member.is_admin:
        raise HTTPException(status_code=403, detail="管理者のみ実行できます")
    return member


@router.get("/me")
async def me(request: Request):
    settings = get_settings()
    return {
        "member": current_member(request).as_dict(),
        "auth_disabled": settings.auth_is_disabled,
        "allowed_email_domain": settings.allowed_email_domain,
    }


@router.post("/auth/ticket")
async def ticket(request: Request):
    """SSE接続用の短期チケット（10分・再利用可）。"""
    return {"ticket": issue_ticket(current_member(request)), "expires_in": TICKET_TTL_SEC}
