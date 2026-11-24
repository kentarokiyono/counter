"""
Supabaseクライアントの生成・保持。

main.py と各ドメインモジュール（task_manager.py 等）の両方から参照されるため、
main.py 側に置くと循環importになる。これを避けるために独立モジュールとして切り出す。
"""
import logging

from fastapi import HTTPException
from supabase import create_client, Client

from config import get_settings

logger = logging.getLogger("toloc.db")

_client: Client | None = None


def init_supabase() -> Client | None:
    """main.py の lifespan から呼ぶ。失敗時はNoneを保持し、以後の呼び出しはNoneを返す。"""
    global _client
    settings = get_settings()
    try:
        _client = create_client(settings.supabase_url, settings.supabase_service_role_key)
        logger.info("Supabaseクライアント初期化完了")
    except Exception:
        logger.exception("Supabaseクライアント初期化失敗")
        _client = None
    return _client


def close_supabase() -> None:
    global _client
    _client = None


def get_supabase() -> Client:
    """
    FastAPIのDependsから利用する。未初期化時は503を返す
    （エンドポイント側で個別にNoneチェックする手間を無くすため）。
    """
    if _client is None:
        raise HTTPException(status_code=503, detail="Supabaseに接続できていません")
    return _client


def get_supabase_or_none() -> Client | None:
    """ヘルスチェックなど、未接続でも200を返したい箇所向け。"""
    return _client
