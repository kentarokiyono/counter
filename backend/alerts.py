"""
エラー通知（Stage18）。

backend で想定外のエラーが起きたとき、画面で JavaScript のエラーが起きたときに
Discord へ知らせる。同じエラーは10分に1回まで。
送り先は DISCORD_ALERT_WEBHOOK_URL（未設定なら DISCORD_WEBHOOK_URL）。
"""
import logging
import time
import traceback

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from starlette.middleware.base import BaseHTTPMiddleware

from config import get_settings

logger = logging.getLogger("toloc.alerts")

router = APIRouter(prefix="/api", tags=["alerts"])

COOLDOWN_SEC = 600
_last_sent: dict[str, float] = {}


def _webhook() -> str:
    s = get_settings()
    return s.discord_alert_webhook_url or s.discord_webhook_url


async def send_alert(key: str, text: str) -> bool:
    url = _webhook()
    if not url:
        return False
    now = time.monotonic()
    if now - _last_sent.get(key, -COOLDOWN_SEC) < COOLDOWN_SEC:
        return False
    _last_sent[key] = now
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(url, json={"content": text[:1900], "allowed_mentions": {"parse": []}})
        return True
    except Exception:
        logger.warning("エラー通知の送信に失敗", exc_info=True)
        return False


class ErrorAlertMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        try:
            return await call_next(request)
        except Exception as exc:
            logger.exception("想定外のエラー: %s %s", request.method, request.url.path)
            member = getattr(getattr(request, "state", None), "member", None)
            tb = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__)[-6:])
            await send_alert(
                f"server:{request.url.path}:{type(exc).__name__}",
                f"**[backend エラー]** {request.method} {request.url.path}\n"
                f"利用者: {getattr(member, 'name', '不明')} / 環境: {get_settings().app_env}\n"
                f"```{tb[-1400:]}```",
            )
            return JSONResponse({"detail": "サーバーでエラーが起きました。管理者に通知済みです。"}, status_code=500)


class ClientError(BaseModel):
    message: str = Field(max_length=1000)
    source: str = Field(default="", max_length=300)
    stack: str = Field(default="", max_length=3000)
    page: str = Field(default="", max_length=300)


_anon_reports: list[float] = []
ANON_REPORTS_PER_HOUR = 5


@router.post("/client-errors")
async def client_error(payload: ClientError, request: Request):
    member = getattr(request.state, "member", None)
    if member is None:
        # ログイン前の画面からも報告できるが、外部からDiscordを荒らされないよう全体で回数を絞る
        now = time.monotonic()
        _anon_reports[:] = [t for t in _anon_reports if now - t < 3600]
        if len(_anon_reports) >= ANON_REPORTS_PER_HOUR:
            return {"reported": False}
        _anon_reports.append(now)
    sent = await send_alert(
        f"client:{payload.message[:120]}",
        f"**[画面のエラー]** {payload.page}\n利用者: {getattr(member, 'name', '不明')}\n"
        f"{payload.message}\n```{(payload.stack or payload.source)[:1200]}```",
    )
    return {"reported": sent}
