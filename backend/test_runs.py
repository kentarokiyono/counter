"""
活動ログ。現地活動・イベント出展・視察ごとに1件作り、現場で記録する。

- 作業時間: 区分（準備・現地対応・撤収・移動）ごとに作業の開始・終了を記録する。押し忘れは後から時刻を直せる
- 記録: 操作の自動記録と手書きのメモ
- まとめ: 画面側で Markdown・CSV に書き出す

物品の管理はイベントの持ち物チェックを使う（ここでは持たない）。
変更はリアルタイム配信（live）で全員の画面に反映する。
"""
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import activity_log
import live
from auth import Member, current_member
from db import get_supabase
from trash import now_iso

logger = logging.getLogger("toloc.test_runs")

router = APIRouter(prefix="/api/test-runs", tags=["test-runs"])

TEAMS = {"prep": "準備", "onsite": "現地対応", "teardown": "撤収", "travel": "移動"}
TeamKey = Literal["prep", "onsite", "teardown", "travel"]
JST = timezone(timedelta(hours=9))
# 端末の時計のずれを見込んで、これより先の時刻は受け付けない
SKEW = timedelta(minutes=5)


# ---------------------------------------------------------------------------
# 入力
# ---------------------------------------------------------------------------
class RunCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    run_date: Optional[date] = None
    location: Optional[str] = Field(default=None, max_length=200)


class RunPatch(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    run_date: Optional[date] = None
    location: Optional[str] = Field(default=None, max_length=200)
    status: Optional[Literal["active", "done"]] = None


class WorkIn(BaseModel):
    team: TeamKey
    task: str = Field(min_length=1, max_length=200)
    # 省略すると「今から開始」。後から記録するときは開始・終了の時刻を入れる
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None


class WorkPatch(BaseModel):
    task: Optional[str] = Field(default=None, min_length=1, max_length=200)
    team: Optional[TeamKey] = None
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    # true なら今の時刻で終了する
    finish: bool = False


class LogIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    details: Optional[str] = Field(default=None, max_length=2000)


# ---------------------------------------------------------------------------
# 共通
# ---------------------------------------------------------------------------
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _ts(v) -> Optional[datetime]:
    if not v:
        return None
    d = v if isinstance(v, datetime) else datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def fmt_dur(seconds: float) -> str:
    """秒 → 1:05:09 / 5:09"""
    s = max(0, int(seconds))
    h, rest = divmod(s, 3600)
    m, s = divmod(rest, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def work_seconds(w: dict, now: Optional[datetime] = None) -> float:
    end = _ts(w.get("ended_at")) or (now or _now())
    return max(0.0, (end - _ts(w["started_at"])).total_seconds())


def _get_run(supabase, run_id: str) -> dict:
    rows = supabase.table("test_runs").select("*").eq("id", run_id).is_("deleted_at", "null").execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="ログが見つかりません")
    return rows[0]


def _update_run(supabase, run_id: str, data: dict) -> dict:
    data = {**data, "updated_at": now_iso()}
    rows = supabase.table("test_runs").update(data).eq("id", run_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="ログが見つかりません")
    live.publish("test_runs", "UPDATE", rows[0])
    return rows[0]


def _log(supabase, run_id: str, actor: Optional[Member], category: str, title: str, details: str = "") -> None:
    try:
        row = (
            supabase.table("test_run_logs")
            .insert(
                {
                    "run_id": run_id,
                    "category": category,
                    "title": title[:200],
                    "details": (details or "")[:2000] or None,
                    "actor": actor.name if actor else None,
                }
            )
            .execute()
            .data[0]
        )
        live.publish("test_run_logs", "INSERT", row)
    except Exception:
        logger.warning("ログの記録に失敗: %s", title, exc_info=True)


def _work(supabase, run_id: str) -> list[dict]:
    rows = supabase.table("test_run_work").select("*").eq("run_id", run_id).execute().data or []
    return sorted(rows, key=lambda r: str(r.get("started_at") or ""))


def _logs(supabase, run_id: str, limit: int = 300) -> list[dict]:
    rows = supabase.table("test_run_logs").select("*").eq("run_id", run_id).execute().data or []
    return sorted(rows, key=lambda r: r.get("created_at") or "", reverse=True)[:limit]


def _get_work(supabase, run_id: str, work_id: str) -> dict:
    rows = supabase.table("test_run_work").select("*").eq("id", work_id).eq("run_id", run_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="作業が見つかりません")
    return rows[0]


def _check_times(started: datetime, ended: Optional[datetime]) -> None:
    if ended and ended < started:
        raise HTTPException(status_code=400, detail="終了は開始より後にしてください")
    limit = _now() + SKEW
    if started > limit or (ended and ended > limit):
        raise HTTPException(status_code=400, detail="未来の時刻は入れられません")


# ---------------------------------------------------------------------------
# ログ
# ---------------------------------------------------------------------------
@router.get("")
async def list_runs(supabase=Depends(get_supabase)):
    rows = supabase.table("test_runs").select("*").is_("deleted_at", "null").execute().data or []
    rows.sort(key=lambda r: (str(r.get("run_date") or ""), r.get("created_at") or ""), reverse=True)
    return rows


@router.post("", status_code=201)
async def create_run(payload: RunCreate, supabase=Depends(get_supabase), actor: Member = Depends(current_member)):
    data = payload.model_dump(mode="json")
    run = (
        supabase.table("test_runs")
        .insert({**{k: v for k, v in data.items() if v is not None}, "status": "active", "created_by": actor.name})
        .execute()
        .data[0]
    )
    live.publish("test_runs", "INSERT", run)
    _log(supabase, run["id"], actor, "記録", "ログを作成しました", run["title"])
    await activity_log.record_async(actor, "test_run", "create", f"ログ「{run['title']}」を作成", str(run["id"]))
    return run


@router.get("/{run_id}")
async def get_run(run_id: str, supabase=Depends(get_supabase)):
    run = _get_run(supabase, run_id)
    return {
        "run": run,
        "teams": [{"key": k, "name": v} for k, v in TEAMS.items()],
        "work": _work(supabase, run_id),
        "logs": _logs(supabase, run_id),
        # 画面が端末の時計のずれを補正できるよう、サーバーの現在時刻を付ける
        "server_now": now_iso(),
    }


@router.patch("/{run_id}")
async def patch_run(run_id: str, payload: RunPatch, supabase=Depends(get_supabase), actor: Member = Depends(current_member)):
    before = _get_run(supabase, run_id)
    data = payload.model_dump(exclude_unset=True, mode="json")
    if data.get("title", "") is None:
        data.pop("title")
    if not data:
        raise HTTPException(status_code=400, detail="更新する項目がありません")
    run = _update_run(supabase, run_id, data)
    if "status" in data and before.get("status") != run.get("status"):
        _log(supabase, run_id, actor, "記録", "終了しました" if run["status"] == "done" else "再開しました")
    return run


@router.delete("/{run_id}", status_code=204)
async def delete_run(run_id: str, supabase=Depends(get_supabase), actor: Member = Depends(current_member)):
    run = _get_run(supabase, run_id)
    _update_run(supabase, run_id, {"deleted_at": now_iso(), "deleted_by": actor.name})
    live.publish("test_runs", "DELETE", {"id": run_id})
    await activity_log.record_async(actor, "test_run", "delete", f"ログ「{run['title']}」をゴミ箱へ移動", run_id)
    return None


# ---------------------------------------------------------------------------
# 作業時間
# ---------------------------------------------------------------------------
@router.post("/{run_id}/work", status_code=201)
async def add_work(run_id: str, payload: WorkIn, supabase=Depends(get_supabase), actor: Member = Depends(current_member)):
    _get_run(supabase, run_id)
    started = _ts(payload.started_at) or _now()
    ended = _ts(payload.ended_at)
    _check_times(started, ended)
    row = (
        supabase.table("test_run_work")
        .insert(
            {
                "run_id": run_id,
                "team": payload.team,
                "task": payload.task.strip(),
                "started_at": started.isoformat(),
                "ended_at": ended.isoformat() if ended else None,
                "created_by": actor.name,
            }
        )
        .execute()
        .data[0]
    )
    live.publish("test_run_work", "INSERT", row)
    team = TEAMS[payload.team]
    if ended:
        _log(supabase, run_id, actor, "作業", f"{team}: {row['task']}（後から記録）", fmt_dur(work_seconds(row)))
    else:
        _log(supabase, run_id, actor, "作業", f"{team}: {row['task']} 開始")
    return row


@router.patch("/{run_id}/work/{work_id}")
async def patch_work(
    run_id: str, work_id: str, payload: WorkPatch, supabase=Depends(get_supabase), actor: Member = Depends(current_member)
):
    before = _get_work(supabase, run_id, work_id)
    data = payload.model_dump(exclude_unset=True, exclude={"finish"})
    for key in ("task", "team", "started_at"):
        if key in data and data[key] is None:
            data.pop(key)
    if payload.finish:
        if before.get("ended_at"):
            return before
        data["ended_at"] = _now()
    if not data:
        raise HTTPException(status_code=400, detail="更新する項目がありません")
    started = _ts(data.get("started_at")) or _ts(before["started_at"])
    ended = _ts(data["ended_at"]) if "ended_at" in data else _ts(before.get("ended_at"))
    _check_times(started, ended)
    for k in ("started_at", "ended_at"):
        if data.get(k) is not None:
            data[k] = _ts(data[k]).isoformat()
    if isinstance(data.get("task"), str):
        data["task"] = data["task"].strip()
    row = supabase.table("test_run_work").update(data).eq("id", work_id).eq("run_id", run_id).execute().data[0]
    live.publish("test_run_work", "UPDATE", row)
    team = TEAMS.get(row["team"], row["team"])
    if payload.finish:
        _log(supabase, run_id, actor, "作業", f"{team}: {row['task']} 終了", fmt_dur(work_seconds(row)))
    else:
        _log(supabase, run_id, actor, "作業", f"{team}: {row['task']} を修正")
    return row


@router.delete("/{run_id}/work/{work_id}", status_code=204)
async def delete_work(run_id: str, work_id: str, supabase=Depends(get_supabase), actor: Member = Depends(current_member)):
    row = _get_work(supabase, run_id, work_id)
    supabase.table("test_run_work").delete().eq("id", work_id).execute()
    live.publish("test_run_work", "DELETE", {"id": work_id, "run_id": run_id})
    _log(supabase, run_id, actor, "作業", f"{TEAMS.get(row['team'], row['team'])}: {row['task']} を削除")
    return None


# ---------------------------------------------------------------------------
# 記録
# ---------------------------------------------------------------------------
@router.post("/{run_id}/logs", status_code=201)
async def add_log(run_id: str, payload: LogIn, supabase=Depends(get_supabase), actor: Member = Depends(current_member)):
    _get_run(supabase, run_id)
    _log(supabase, run_id, actor, "メモ", payload.title, payload.details or "")
    return {"ok": True}
