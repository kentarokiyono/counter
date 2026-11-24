"""
Toloc OS API（FastAPI エントリーポイント）。

タスク・イベント・活動ログ・シール集計・メンバー管理。
認証は Supabase Auth（Google ログイン）、データは Supabase（service_role で backend からのみ読み書き）。
"""
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
import db
from auth import AuthMiddleware, router as auth_router
from live import router as live_router
from activity_log import router as activity_log_router
from trash import router as trash_router
from history import router as history_router
from search import router as search_router
from test_runs import router as test_runs_router
from join import router as join_router
from cron import router as cron_router
from push import router as push_router
from comments import router as comments_router
from templates import router as templates_router
from export import router as export_router
from alerts import ErrorAlertMiddleware, router as alerts_router
from calendar_feed import router as calendar_router
from task_manager import router as task_router
from event_manager import router as event_router
from analytics import router as analytics_router
from activity import router as activity_router
from members import router as members_router
from stickers import router as stickers_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("toloc.main")

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_supabase()
    yield
    db.close_supabase()


app = FastAPI(title="Toloc OS API", lifespan=lifespan)


# ミドルウェアは後に追加したものが外側になる。CORSを最外側にして、
# 401応答にもCORSヘッダが付く（ブラウザが理由を読める）ようにするため、
# 認証を先に、CORSを後に追加する。
app.add_middleware(ErrorAlertMiddleware)
app.add_middleware(AuthMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(live_router)
app.include_router(activity_log_router)
app.include_router(trash_router)
app.include_router(history_router)
app.include_router(search_router)
app.include_router(test_runs_router)
app.include_router(join_router)
app.include_router(cron_router)
app.include_router(push_router)
app.include_router(comments_router)
app.include_router(templates_router)
app.include_router(export_router)
app.include_router(alerts_router)
app.include_router(calendar_router)
app.include_router(task_router)
app.include_router(event_router)
app.include_router(analytics_router)
app.include_router(activity_router)
app.include_router(members_router)
app.include_router(stickers_router)


@app.get("/api/health")
async def health():
    """
    死活監視用。Supabaseへの疎通も確認する。
    """
    supabase_ok = False
    supabase = db.get_supabase_or_none()
    if supabase is not None:
        try:
            supabase.table("tasks").select("id").limit(1).execute()
            supabase_ok = True
        except Exception:
            logger.exception("Supabase疎通確認失敗")
            supabase_ok = False

    return {
        "status": "ok",
        "env": settings.app_env,
        "supabase_connected": supabase_ok,
        "discord_configured": bool(settings.discord_webhook_url),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
