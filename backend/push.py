"""
スマホへの通知（Web Push、Stage17）。

ホーム画面に追加したアプリ（iPhone は iOS 16.4 以降）で「通知を受け取る」をオンにすると、
ブラウザが発行する購読情報を push_subscriptions に保存する。
Windows版は Web Push を受けられないため、開いている間はリアルタイム配信（live）で同じ通知を受け取る。
送るのは本人に関係するものだけ: 担当になった・承認待ちがある・毎朝の自分の期限。
"""
import asyncio
import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import db
import live
from auth import Member, current_member
from config import get_settings
from db import get_supabase

logger = logging.getLogger("toloc.push")

router = APIRouter(prefix="/api/push", tags=["push"])


class SubscriptionKeys(BaseModel):
    p256dh: str = Field(min_length=10)
    auth: str = Field(min_length=4)


class SubscriptionIn(BaseModel):
    endpoint: str = Field(min_length=10, max_length=1000)
    keys: SubscriptionKeys


class Unsubscribe(BaseModel):
    endpoint: str


def enabled() -> bool:
    s = get_settings()
    return bool(s.vapid_public_key and s.vapid_private_key)


@router.get("/public-key")
async def public_key():
    s = get_settings()
    return {"enabled": enabled(), "public_key": s.vapid_public_key or None}


@router.post("/subscribe", status_code=201)
async def subscribe(payload: SubscriptionIn, supabase=Depends(get_supabase), me: Member = Depends(current_member)):
    if not enabled():
        raise HTTPException(status_code=404, detail="通知はまだ設定されていません（管理者に VAPID 鍵の設定を依頼）")
    supabase.table("push_subscriptions").delete().eq("endpoint", payload.endpoint).execute()
    supabase.table("push_subscriptions").insert(
        {"member_name": me.name, "endpoint": payload.endpoint, "p256dh": payload.keys.p256dh, "auth": payload.keys.auth}
    ).execute()
    return {"ok": True}


@router.post("/unsubscribe")
async def unsubscribe(payload: Unsubscribe, supabase=Depends(get_supabase)):
    supabase.table("push_subscriptions").delete().eq("endpoint", payload.endpoint).execute()
    return {"ok": True}


@router.post("/test")
async def test(me: Member = Depends(current_member)):
    title, body = "通知のテスト", "この端末に通知が届きました。"
    delivered = live.publish_to_member(me.name, title, body, "/")
    sent = await notify_member(me.name, title, body, "/", desktop=False)
    return {"sent": sent, "desktop": delivered}


def _send_sync(member_name: str, title: str, body: str, url: str) -> int:
    if not enabled():
        return 0
    from pywebpush import WebPushException, webpush

    s = get_settings()
    supabase = db.get_supabase()
    try:
        subs = supabase.table("push_subscriptions").select("*").eq("member_name", member_name).execute().data or []
    except Exception:
        logger.debug("push_subscriptions の取得に失敗", exc_info=True)
        return 0
    data = json.dumps({"title": title, "body": body, "url": url}, ensure_ascii=False)
    sent = 0
    for sub in subs:
        try:
            webpush(
                subscription_info={"endpoint": sub["endpoint"], "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]}},
                data=data,
                vapid_private_key=s.vapid_private_key,
                vapid_claims={"sub": s.vapid_subject},
                ttl=60 * 60 * 12,
            )
            sent += 1
        except WebPushException as exc:
            status = getattr(getattr(exc, "response", None), "status_code", None)
            if status in (404, 410):
                # 端末側で通知をやめた・アプリを消した
                supabase.table("push_subscriptions").delete().eq("endpoint", sub["endpoint"]).execute()
            else:
                logger.warning("通知の送信に失敗: %s", exc)
        except Exception:
            logger.warning("通知の送信に失敗", exc_info=True)
    return sent


async def notify_member(member_name: str | None, title: str, body: str, url: str = "/", desktop: bool = True) -> int:
    """本人の全端末に通知する（Web Push の送信数を返す）。失敗しても例外は投げない。"""
    if not member_name:
        return 0
    if desktop:
        live.publish_to_member(member_name, title, body, url)
    if not enabled():
        return 0
    try:
        return await asyncio.to_thread(_send_sync, member_name, title, body, url)
    except Exception:
        logger.warning("通知処理でエラー", exc_info=True)
        return 0


def notify_member_later(member_name: str | None, title: str, body: str, url: str = "/") -> None:
    """レスポンスを待たせないよう、バックグラウンドで送る。"""
    if not member_name:
        return
    live.publish_to_member(member_name, title, body, url)
    if not enabled():
        return
    try:
        asyncio.get_running_loop().create_task(notify_member(member_name, title, body, url, desktop=False))
    except RuntimeError:
        pass
