"""検索（Stage21）。件数が多くなるタスクのコメントだけサーバーで探す（他は画面側で絞り込む）。"""
import logging
import unicodedata

from fastapi import APIRouter, Depends, Query

from db import get_supabase

logger = logging.getLogger("toloc.search")

router = APIRouter(prefix="/api/search", tags=["search"])

LIMIT = 8


def _norm(s: str) -> str:
    return unicodedata.normalize("NFKC", s or "").lower()


@router.get("/comments")
async def search_comments(q: str = Query(min_length=1, max_length=100), supabase=Depends(get_supabase)):
    needle = _norm(q.strip())
    if not needle:
        return []
    try:
        tasks = {
            t["id"]: t["title"]
            for t in supabase.table("tasks").select("id,title,deleted_at").execute().data or []
            if not t.get("deleted_at")
        }
        rows = supabase.table("task_comments").select("*").order("created_at", desc=True).execute().data or []
    except Exception:
        logger.warning("コメントの検索に失敗", exc_info=True)
        return []
    hits = []
    for c in rows:
        if c.get("task_id") in tasks and needle in _norm(c.get("body", "")):
            hits.append(
                {
                    "id": c["id"],
                    "task_id": c["task_id"],
                    "task_title": tasks[c["task_id"]],
                    "author": c.get("author"),
                    "body": c.get("body", ""),
                }
            )
            if len(hits) >= LIMIT:
                break
    return hits
