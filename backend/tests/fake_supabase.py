"""テスト用のインメモリ Supabase（postgrest のクエリビルダの必要部分だけ再現）。"""
import collections
import copy
import uuid
from datetime import datetime, timezone


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


DEFAULTS = {
    "tasks": dict(status="todo", description=None, assignee_name=None, domain=None, due_date=None),
    "events": dict(status="planned", assignees=[], checklist=[], description=None, location=None, end_time=None),
    "members": dict(email=None, role="member"),
    "sticker_surveys": dict(status="active", survey_date=None, location=None, event_id=None),
}
UNIQUE = {"members": ["name", "email"]}


class Result:
    def __init__(self, data):
        self.data = data


class Query:
    def __init__(self, db: "FakeSupabase", table: str):
        self.db, self.t = db, table
        self.op, self.payload = "select", None
        self.filters, self._order, self._limit, self._neg = [], None, None, False

    def _add(self, f):
        if self._neg:
            self._neg = False
            self.filters.append(lambda r, f=f: not f(r))
        else:
            self.filters.append(f)
        return self

    @property
    def not_(self):
        self._neg = True
        return self

    def select(self, *a, **k):
        self.op = "select"
        return self

    def insert(self, p):
        self.op, self.payload = "insert", p
        return self

    def upsert(self, p):
        self.op, self.payload = "upsert", p
        return self

    def update(self, p):
        self.op, self.payload = "update", p
        return self

    def delete(self):
        self.op = "delete"
        return self

    def eq(self, k, v):
        return self._add(lambda r: str(r.get(k)) == str(v))

    def gte(self, k, v):
        return self._add(lambda r: r.get(k) is not None and str(r.get(k)) >= str(v))

    def lte(self, k, v):
        return self._add(lambda r: r.get(k) is not None and str(r.get(k)) <= str(v))

    def lt(self, k, v):
        return self._add(lambda r: r.get(k) is not None and str(r.get(k)) < str(v))

    def gt(self, k, v):
        return self._add(lambda r: r.get(k) is not None and str(r.get(k)) > str(v))

    def in_(self, k, vs):
        return self._add(lambda r: r.get(k) in vs)

    def is_(self, k, v):
        return self._add(lambda r: r.get(k) is None)

    def order(self, k, desc=False):
        self._order = (k, desc)
        return self

    def limit(self, n):
        self._limit = n
        return self

    def range(self, start, end):
        self._range = (start, end)
        return self

    def execute(self):
        rows = self.db.tables[self.t]
        if self.op in ("insert", "upsert"):
            items = self.payload if isinstance(self.payload, list) else [self.payload]
            out = []
            for it in items:
                it = copy.deepcopy(it)
                it.setdefault("id", str(uuid.uuid4()))
                existing = [r for r in rows if r["id"] == it["id"]]
                if existing:
                    existing[0].update(it)
                    existing[0]["updated_at"] = _now()
                    out.append(existing[0])
                    continue
                for col in UNIQUE.get(self.t, []):
                    if it.get(col) is not None and any(r.get(col) == it[col] for r in rows):
                        raise Exception(f"duplicate key {col}")
                row = {"created_at": _now(), "updated_at": _now(), "deleted_at": None}
                row.update(copy.deepcopy(DEFAULTS.get(self.t, {})))
                row.update(it)
                rows.append(row)
                out.append(row)
            return Result(copy.deepcopy(out))
        sel = [r for r in rows if all(f(r) for f in self.filters)]
        if self.op == "update":
            for r in sel:
                r.update(copy.deepcopy(self.payload))
                r["updated_at"] = _now()
            return Result(copy.deepcopy(sel))
        if self.op == "delete":
            for r in sel:
                rows.remove(r)
            return Result(copy.deepcopy(sel))
        if self._order:
            k, desc = self._order
            sel = sorted(sel, key=lambda r: str(r.get(k) or ""), reverse=desc)
        if getattr(self, "_range", None):
            a, b = self._range
            sel = sel[a : b + 1]
        if self._limit:
            sel = sel[: self._limit]
        return Result(copy.deepcopy(sel))


class _User:
    def __init__(self, email, meta):
        self.email, self.user_metadata = email, meta


class _UserResponse:
    def __init__(self, user):
        self.user = user


class FakeAuth:
    def __init__(self):
        self.users = {}

    def get_user(self, token):
        if token not in self.users:
            raise Exception("invalid token")
        return _UserResponse(_User(*self.users[token]))


class FakeStorage:
    def __init__(self):
        self.files = {}

    def from_(self, bucket):
        return self

    def upload(self, path, data, opts=None):
        self.files[path] = data
        self.opts = getattr(self, "opts", {})
        self.opts[path] = opts
        return {"path": path}

    def list(self, prefix="", opts=None):
        """フォルダ（id なし）とファイル（id あり）を返す"""
        pre = f"{prefix}/" if prefix else ""
        seen, out = set(), []
        for p in self.files:
            if not p.startswith(pre):
                continue
            head, _, rest = p[len(pre):].partition("/")
            if head in seen:
                continue
            seen.add(head)
            out.append({"name": head, "id": None} if rest else {"name": head, "id": "f-" + head})
        return out

    def create_signed_url(self, path, expires):
        return {"signedURL": f"https://signed.example/{path}"}


class FakeSupabase:
    def __init__(self):
        self.tables = collections.defaultdict(list)
        self.auth = FakeAuth()
        self.storage = FakeStorage()

    def table(self, name):
        return Query(self, name)

    def rpc(self, fn, params):
        """schema.sql の DB 関数（sticker_tap / sticker_undo）と同じ動き"""
        return _Rpc(getattr(self, "_rpc_" + fn)(**params))

    def _rpc_sticker_tap(self, p_survey, p_pref, p_color, p_actor):
        taps = self.tables["sticker_taps"]
        taps.append(dict(id=len(taps) + 1, survey_id=p_survey, pref=p_pref, color=p_color, actor=p_actor, undone=False))
        counts = self.tables["sticker_counts"]
        row = next(
            (r for r in counts if r["survey_id"] == p_survey and r["pref"] == p_pref and r["color"] == p_color), None
        )
        if row is None:
            row = dict(id=str(uuid.uuid4()), survey_id=p_survey, pref=p_pref, color=p_color, count=0)
            counts.append(row)
        row["count"] += 1
        row["updated_at"] = _now()
        return [copy.deepcopy(row)]

    def _rpc_sticker_undo(self, p_survey, p_actor):
        mine = [t for t in self.tables["sticker_taps"] if t["survey_id"] == p_survey and t["actor"] == p_actor and not t["undone"]]
        if not mine:
            return []
        t = max(mine, key=lambda t: t["id"])
        t["undone"] = True
        for r in self.tables["sticker_counts"]:
            if r["survey_id"] == p_survey and r["pref"] == t["pref"] and r["color"] == t["color"]:
                r["count"] = max(0, r["count"] - 1)
                return [copy.deepcopy(r)]
        return []


class _Rpc:
    def __init__(self, data):
        self.data = data

    def execute(self):
        return Result(self.data)
