"""
リアルタイム配信（Stage16）。

以前はフロントが Supabase Realtime を anon キーで直接購読していたが、RLS で anon からの
読み取りを禁止したため、backend が変更を SSE で配信する方式に変えた。
書き込みは全て backend の API を通るので、API 側で publish() を呼べば漏れなく届く。
（backend を複数プロセスで動かす構成にする場合は Redis 等の共有 pub/sub が必要）
"""
import asyncio
import json
import logging
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

logger = logging.getLogger("toloc.realtime")

router = APIRouter(prefix="/api/realtime", tags=["realtime"])

# キュー → (管理者か, メンバー名)。管理者だけに配る変更・本人だけに配る通知があるため
_subscribers: dict[asyncio.Queue, tuple[bool, str | None]] = {}
HEARTBEAT_SEC = 25


def publish(table: str, event: str, row: dict[str, Any], admin_only: bool = False) -> None:
    """event: INSERT | UPDATE | DELETE。DELETE は row に id だけあればよい。admin_only なら管理者にだけ配る。"""
    message = json.dumps({"table": table, "event": event, "row": row}, ensure_ascii=False, default=str)
    for q, (is_admin, _name) in list(_subscribers.items()):
        if admin_only and not is_admin:
            continue
        _put(q, message)


def publish_to_member(member_name: str, title: str, body: str, url: str = "/") -> int:
    """本人の接続中の画面だけに通知を配る（Windows版がWindowsの通知として出す）。配った接続数を返す。"""
    message = json.dumps(
        {"table": "_notify", "event": "INSERT", "row": {"title": title, "body": body, "url": url}}, ensure_ascii=False
    )
    count = 0
    for q, (_admin, name) in list(_subscribers.items()):
        if name == member_name and _put(q, message):
            count += 1
    return count


def _put(q: asyncio.Queue, message: str) -> bool:
    try:
        q.put_nowait(message)
        return True
    except asyncio.QueueFull:
        # 詰まった購読者は切断扱い（再接続時に再取得させる）
        _subscribers.pop(q, None)
        return False


@router.get("/stream")
async def stream(request: Request):
    queue: asyncio.Queue = asyncio.Queue(maxsize=500)
    member = getattr(request.state, "member", None)
    _subscribers[queue] = (bool(getattr(member, "is_admin", False)), getattr(member, "name", None))

    async def gen():
        try:
            yield 'data: {"table":"_system","event":"READY","row":{}}\n\n'
            while True:
                try:
                    message = await asyncio.wait_for(queue.get(), timeout=HEARTBEAT_SEC)
                    yield f"data: {message}\n\n"
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
        finally:
            _subscribers.pop(queue, None)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )
