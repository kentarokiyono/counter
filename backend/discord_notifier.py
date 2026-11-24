"""
Discord Webhook通知。

  - config/member_discord_map.json からメンバー名 → Discord User IDを解決
  - タスク・イベントの担当割当時に <@user_id> メンション付きWebhook送信
  - Webhook送信失敗はログのみに留め、呼び出し元の本処理は失敗させない
"""
import json
import logging
import re
from pathlib import Path
from typing import Optional

import httpx

from config import get_settings

logger = logging.getLogger("toloc.discord_notifier")

_MEMBER_MAP_PATH = (
    Path(__file__).resolve().parent.parent / "config" / "member_discord_map.json"
)

_member_map_cache: Optional[dict] = None


def _load_member_map() -> dict:
    global _member_map_cache
    if _member_map_cache is not None:
        return _member_map_cache

    if not _MEMBER_MAP_PATH.exists():
        logger.warning("member_discord_map.json が見つかりません: %s", _MEMBER_MAP_PATH)
        _member_map_cache = {"members": [], "roles": []}
        return _member_map_cache

    try:
        with _MEMBER_MAP_PATH.open(encoding="utf-8") as f:
            _member_map_cache = json.load(f)
    except Exception:
        logger.exception("member_discord_map.json の読み込みに失敗しました")
        _member_map_cache = {"members": [], "roles": []}

    return _member_map_cache


def reload_member_map() -> None:
    """member_discord_map.json を編集した後、プロセス再起動なしで反映したい場合に呼ぶ。"""
    global _member_map_cache
    _member_map_cache = None


def resolve_discord_user_id(member_name: str) -> Optional[str]:
    """メンバー名からDiscord User IDを引く。大文字小文字・前後空白は無視する。"""
    member_map = _load_member_map()
    target = member_name.strip().lower()
    for member in member_map.get("members", []):
        if member.get("name", "").strip().lower() == target:
            discord_id = (member.get("discord_user_id") or "").strip()
            return discord_id or None
    return None


def _extract_mentioned_user_ids(content: str) -> list[str]:
    """
    content中の <@123456789> 形式からuser_idを抽出する。
    Discordの allowed_mentions ホワイトリストに渡し、意図しない@everyone等の暴発を防ぐため。
    """
    return re.findall(r"<@(\d+)>", content)


async def send_webhook_message(content: str) -> bool:
    """
    Webhook送信。成否をboolで返し、例外は投げない
    （タスク作成/更新のたびにDiscord障害でAPI全体が500にならないようにするため）。
    """
    settings = get_settings()
    if not settings.discord_webhook_url:
        logger.info("DISCORD_WEBHOOK_URL未設定のため通知をスキップしました")
        return False

    payload = {
        "content": content,
        "allowed_mentions": {
            "parse": [],
            "users": _extract_mentioned_user_ids(content),
        },
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(settings.discord_webhook_url, json=payload)
            res.raise_for_status()
        return True
    except Exception:
        logger.exception("Discord Webhook送信に失敗しました")
        return False


async def notify_task_assigned(task_title: str, assignee_name: str, task_id: str) -> bool:
    """
    タスク割当通知。担当者のDiscord IDが未登録の場合は名前のみで通知する
    （メンションできないことを理由に通知自体をスキップしない）。
    """
    discord_id = resolve_discord_user_id(assignee_name)
    mention = f"<@{discord_id}>" if discord_id else f"**{assignee_name}**"

    content = (
        f"📋 タスクが割り当てられました\n"
        f"{mention}\n"
        f"**{task_title}**"
    )
    return await send_webhook_message(content)


async def notify_event_assigned(
    event_title: str, assignees: list[str], event_id: str, start_time: str
) -> bool:
    """
    イベント担当通知。複数担当者を1メッセージにまとめてメンションする
    （担当者ごとに個別送信すると通知数が膨らむため）。
    assigneesが空の場合は送信自体をスキップする。
    """
    if not assignees:
        return False

    mentions = []
    for name in assignees:
        discord_id = resolve_discord_user_id(name)
        mentions.append(f"<@{discord_id}>" if discord_id else f"**{name}**")

    content = (
        f"📅 イベント担当に割り当てられました\n"
        f"{' '.join(mentions)}\n"
        f"**{event_title}**\n"
        f"開始: {start_time}"
    )
    return await send_webhook_message(content)
