"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ModulePageHeader from "@/components/ModulePageHeader";
import Segmented from "@/components/ui/Segmented";
import Sheet from "@/components/ui/Sheet";
import { Field, Group, Row } from "@/components/ui/Grouped";
import { useToast } from "@/components/Toast";
import { subscribeLive } from "@/lib/live";
import { BADGE } from "@/lib/palette";
import { copyText } from "@/lib/exportText";
import { confirmDelete } from "@/lib/confirmDelete";
import {
  RunLog,
  TEAMS,
  TEAM_NAME,
  TEAM_TONE,
  TeamKey,
  TestRun,
  Work,
  addLog,
  addWork,
  deleteRun,
  deleteWork,
  fmtDur,
  getRun,
  hm,
  patchRun,
  patchWork,
  workSeconds,
} from "@/lib/testRunApi";
import { logsCsv, markdownReport, saveCsv, saveMarkdown, workCsv } from "@/lib/testRunExport";

type Tab = "work" | "log" | "report";

const errMsg = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

/** ISO → <input type="datetime-local"> の値（端末の時刻） */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const fromLocalInput = (v: string) => new Date(v).toISOString();

/** 作業中のものがある間だけ、画面の時間を1秒ごとに進める */
function useTicker(active: boolean) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [active]);
}

// ---------------------------------------------------------------------------
// 作業時間
// ---------------------------------------------------------------------------
function TeamCard({ run, team, work, now }: { run: TestRun; team: (typeof TEAMS)[number]; work: Work[]; now: number }) {
  const toast = useToast();
  const [task, setTask] = useState("");
  const [busy, setBusy] = useState(false);
  const mine = work.filter((w) => w.team === team.key);
  const running = mine.filter((w) => !w.ended_at);
  const total = mine.reduce((s, w) => s + workSeconds(w, now), 0);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (!task.trim()) return;
    setBusy(true);
    try {
      await addWork(run.id, { team: team.key, task: task.trim() });
      setTask("");
    } catch (err) {
      toast.error(errMsg(err, "開始できませんでした"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col rounded-2xl bg-card p-4" aria-label={team.name}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[17px] font-semibold">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: `var(--p-${team.tone}-bar)` }} />
          {team.name}
        </h3>
        <span className="text-[13px] text-label-2 tabular-nums">
          合計 <span className="text-[17px] font-semibold text-label">{fmtDur(total)}</span>
        </span>
      </div>

      <ul className="mb-3 space-y-2">
        {running.map((w) => (
          <li key={w.id} className="flex items-center gap-2 rounded-xl bg-fill px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-medium">{w.task}</div>
              <div className="text-[12px] text-label-2 tabular-nums">{hm(w.started_at)} から</div>
            </div>
            <span className="text-[17px] font-semibold tabular-nums">{fmtDur(workSeconds(w, now))}</span>
            <button
              type="button"
              className="ios-btn px-3 py-1.5 text-[14px]"
              onClick={() => patchWork(run.id, w.id, { finish: true }).catch((err) => toast.error(errMsg(err, "終了できませんでした")))}
              aria-label={`${w.task}を終了`}
            >
              終了
            </button>
          </li>
        ))}
        {running.length === 0 && <li className="px-1 text-[14px] text-label-2">作業中のものはありません</li>}
      </ul>

      <form onSubmit={start} className="mt-auto flex gap-2">
        <input
          className="ios-input min-w-0 flex-1 bg-fill"
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="作業内容"
          aria-label={`${team.name}の作業内容`}
          maxLength={200}
        />
        <button type="submit" className="ios-btn shrink-0 px-4" disabled={busy || !task.trim()}>
          開始
        </button>
      </form>
    </section>
  );
}

/** 作業の追加（後から記録）と修正 */
function WorkSheet({ run, open, onClose, editing }: { run: TestRun; open: boolean; onClose: () => void; editing: Work | null }) {
  const toast = useToast();
  const [team, setTeam] = useState<TeamKey>("prep");
  const [task, setTask] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTeam(editing?.team ?? "prep");
    setTask(editing?.task ?? "");
    setStart(toLocalInput(editing?.started_at ?? null));
    setEnd(toLocalInput(editing?.ended_at ?? null));
  }, [open, editing]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!task.trim() || !start) return;
    setBusy(true);
    try {
      if (editing) {
        await patchWork(run.id, editing.id, {
          team,
          task: task.trim(),
          started_at: fromLocalInput(start),
          ended_at: end ? fromLocalInput(end) : null,
        });
      } else {
        await addWork(run.id, { team, task: task.trim(), started_at: fromLocalInput(start), ended_at: end ? fromLocalInput(end) : undefined });
      }
      onClose();
    } catch (err) {
      toast.error(errMsg(err, "保存できませんでした"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? "作業を修正" : "作業を後から記録"}
      leading={
        <button type="button" className="ios-btn-plain" onClick={onClose}>
          キャンセル
        </button>
      }
      trailing={
        <button type="submit" form="work-form" className="ios-btn-plain font-semibold" disabled={busy || !task.trim() || !start}>
          保存
        </button>
      }
    >
      <form id="work-form" onSubmit={submit} className="space-y-4">
        <Field label="区分" group>
          <Segmented<TeamKey> className="w-full" value={team} onChange={setTeam} options={TEAMS.map((t) => ({ value: t.key, label: t.name }))} />
        </Field>
        <Field label="作業内容" required>
          <input className="ios-input bg-card" value={task} onChange={(e) => setTask(e.target.value)} maxLength={200} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="開始" required>
            <input type="datetime-local" className="ios-input bg-card" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="終了">
            <input type="datetime-local" className="ios-input bg-card" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        {editing && (
          <Group className="mb-0!">
            <Row
              destructive
              onClick={() => {
                if (!confirm(`「${editing.task}」の記録を削除しますか？`)) return;
                deleteWork(run.id, editing.id)
                  .then(onClose)
                  .catch((err) => toast.error(errMsg(err, "削除できませんでした")));
              }}
            >
              この作業の記録を削除
            </Row>
          </Group>
        )}
      </form>
    </Sheet>
  );
}

function WorkPanel({ run, work, now }: { run: TestRun; work: Work[]; now: number }) {
  const [sheet, setSheet] = useState<{ open: boolean; editing: Work | null }>({ open: false, editing: null });
  const list = [...work].sort((a, b) => b.started_at.localeCompare(a.started_at));

  return (
    <>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {TEAMS.map((t) => (
          <TeamCard key={t.key} run={run} team={t} work={work} now={now} />
        ))}
      </div>

      <Group
        title="作業の一覧"
        action={
          <button type="button" className="ios-btn-plain text-[13px]" onClick={() => setSheet({ open: true, editing: null })}>
            ＋ 後から記録
          </button>
        }
      >
        {list.length === 0 && (
          <Row>
            <span className="text-label-2">記録はまだありません</span>
          </Row>
        )}
        {list.map((w) => (
          <Row
            key={w.id}
            onClick={() => setSheet({ open: true, editing: w })}
            detail={<span className="font-semibold text-label tabular-nums">{fmtDur(workSeconds(w, now))}</span>}
            chevron
          >
            <div className="flex items-center gap-2">
              <span className={`shrink-0 rounded-sm px-1.5 py-0.5 text-[11px] font-semibold ${BADGE[TEAM_TONE[w.team]]}`}>{TEAM_NAME[w.team]}</span>
              <span className="truncate">{w.task}</span>
            </div>
            <div className="text-[13px] text-label-2 tabular-nums">
              {hm(w.started_at)}〜{w.ended_at ? hm(w.ended_at) : "作業中"}
              {w.created_by ? ` · ${w.created_by}` : ""}
            </div>
          </Row>
        ))}
      </Group>

      <WorkSheet run={run} open={sheet.open} editing={sheet.editing} onClose={() => setSheet({ open: false, editing: null })} />
    </>
  );
}

// ---------------------------------------------------------------------------
// 記録
// ---------------------------------------------------------------------------
const LOG_TONE: Record<string, keyof typeof BADGE> = { 作業: "blue", メモ: "green", 記録: "gray" };

function LogPanel({ run, logs }: { run: TestRun; logs: RunLog[] }) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await addLog(run.id, { title: title.trim() });
      setTitle("");
    } catch (err) {
      toast.error(errMsg(err, "記録できませんでした"));
    }
  }
  return (
    <div className="max-w-3xl">
      <form onSubmit={add} className="mb-4 flex gap-2">
        <input className="ios-input flex-1 bg-card" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="メモを記録（例: 来場者が増えてきた）" aria-label="メモを記録" />
        <button type="submit" className="ios-btn" disabled={!title.trim()}>
          記録
        </button>
      </form>
      <Group>
        {logs.length === 0 && (
          <Row>
            <span className="text-label-2">記録はまだありません</span>
          </Row>
        )}
        {logs.map((l) => (
          <Row key={l.id}>
            <div className="flex items-start gap-2">
              <span className="w-[42px] shrink-0 pt-0.5 text-[12px] text-label-2 tabular-nums">{hm(l.created_at)}</span>
              <span className={`mt-0.5 shrink-0 rounded-sm px-1.5 py-0.5 text-[11px] font-semibold ${BADGE[LOG_TONE[l.category] ?? "gray"]}`}>{l.category}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[15px]">{l.title}</div>
                {l.details && <div className="whitespace-pre-wrap text-[13px] text-label-2">{l.details}</div>}
              </div>
              {l.actor && <span className="shrink-0 text-[12px] text-label-2">{l.actor}</span>}
            </div>
          </Row>
        ))}
      </Group>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 報告書・書き出し
// ---------------------------------------------------------------------------
function ReportPanel({ run, work, logs, now }: { run: TestRun; work: Work[]; logs: RunLog[]; now: number }) {
  const toast = useToast();
  const md = markdownReport(run, work, logs, now);

  const save = async (fn: () => Promise<string>) => {
    try {
      if ((await fn()) !== "cancelled") toast.success("保存しました");
    } catch {
      toast.error("保存できませんでした");
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section>
        <h2 className="mb-2 px-1 text-[13px] text-label-2">まとめ</h2>
        <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-2xl bg-card p-4 font-mono text-[13px] leading-relaxed">
          {md}
        </div>
      </section>

      <section>
        <h2 className="mb-2 px-1 text-[13px] text-label-2">書き出し</h2>
        <Group>
          <Row onClick={() => save(() => saveMarkdown(run.title, md))}>
            <span className="text-accent">まとめを保存（Markdown）</span>
          </Row>
          <Row
            onClick={() =>
              copyText(md)
                .then(() => toast.success("コピーしました"))
                .catch(() => toast.error("コピーできませんでした"))
            }
          >
            <span className="text-accent">まとめをコピー</span>
          </Row>
          <Row onClick={() => save(() => saveCsv(run.title, "作業時間", workCsv(work, now)))}>
            <span className="text-accent">作業時間をCSVで保存</span>
          </Row>
          <Row onClick={() => save(() => saveCsv(run.title, "記録", logsCsv(logs)))}>
            <span className="text-accent">記録をCSVで保存</span>
          </Row>
        </Group>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 基本情報の編集
// ---------------------------------------------------------------------------
function EditSheet({ run, open, onClose, onRun }: { run: TestRun; open: boolean; onClose: () => void; onRun: (r: TestRun) => void }) {
  const toast = useToast();
  const [f, setF] = useState({ title: "", run_date: "", location: "" });
  useEffect(() => {
    if (open) setF({ title: run.title, run_date: run.run_date ?? "", location: run.location ?? "" });
  }, [open, run]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      onRun(await patchRun(run.id, { title: f.title.trim() || run.title, run_date: f.run_date || null, location: f.location.trim() || null }));
      onClose();
    } catch (err) {
      toast.error(errMsg(err, "保存できませんでした"));
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="活動ログの情報"
      leading={
        <button type="button" className="ios-btn-plain" onClick={onClose}>
          キャンセル
        </button>
      }
      trailing={
        <button type="submit" form="edit-run" className="ios-btn-plain font-semibold">
          保存
        </button>
      }
    >
      <form id="edit-run" onSubmit={submit} className="space-y-4">
        <Field label="名前" required>
          <input className="ios-input bg-card" value={f.title} onChange={set("title")} maxLength={200} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="日付">
            <input type="date" className="ios-input bg-card" value={f.run_date} onChange={set("run_date")} />
          </Field>
          <Field label="場所">
            <input className="ios-input bg-card" value={f.location} onChange={set("location")} />
          </Field>
        </div>
      </form>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// ページ
// ---------------------------------------------------------------------------
export default function TestRunPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [run, setRun] = useState<TestRun | null>(null);
  const [work, setWork] = useState<Work[]>([]);
  const [logs, setLogs] = useState<RunLog[]>([]);
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState<Tab>("work");
  const [editOpen, setEditOpen] = useState(false);
  // サーバー時刻 - 端末時刻（全員の画面で同じ作業時間を出すため）
  const offset = useRef(0);

  const load = useCallback(() => {
    getRun(id)
      .then((d) => {
        offset.current = new Date(d.server_now).getTime() - Date.now();
        setRun(d.run);
        setWork(d.work);
        setLogs(d.logs);
      })
      .catch(() => setMissing(true));
  }, [id]);

  useEffect(() => {
    load();
    const mine = (row: Record<string, unknown>) => row.run_id === id;
    const offs = [
      subscribeLive(
        "test_runs",
        (ev, row) => {
          if (row.id !== id) return;
          if (ev === "DELETE") setMissing(true);
          else setRun((p) => ({ ...(p ?? {}), ...(row as unknown as TestRun) }));
        },
        load
      ),
      subscribeLive("test_run_work", (ev, row) => {
        if (!mine(row)) return;
        setWork((p) =>
          ev === "DELETE"
            ? p.filter((x) => x.id !== row.id)
            : p.some((x) => x.id === row.id)
              ? p.map((x) => (x.id === row.id ? (row as unknown as Work) : x))
              : [...p, row as unknown as Work]
        );
      }),
      subscribeLive("test_run_logs", (ev, row) => {
        if (!mine(row) || ev !== "INSERT") return;
        setLogs((p) => (p.some((x) => x.id === row.id) ? p : [row as unknown as RunLog, ...p]));
      }),
    ];
    return () => offs.forEach((f) => f());
  }, [id, load]);

  useTicker(work.some((w) => !w.ended_at));
  const now = Date.now() + offset.current;

  if (missing)
    return (
      <div className="mx-auto max-w-3xl">
        <ModulePageHeader title="活動ログ" back={{ href: "/test-runs", label: "活動ログ" }} />
        <p className="text-[15px] text-label-2">見つかりません（削除された可能性があります）</p>
      </div>
    );
  if (!run) return <p className="text-[15px] text-label-3">読み込み中...</p>;

  const runningCount = work.filter((w) => !w.ended_at).length;

  return (
    <div className="mx-auto max-w-7xl">
      <ModulePageHeader
        title={run.title}
        back={{ href: "/test-runs", label: "活動ログ" }}
        actions={
          <>
            <button type="button" className="ios-btn-gray px-3" onClick={() => setEditOpen(true)}>
              編集
            </button>
            <button
              type="button"
              className="ios-btn-gray px-3"
              onClick={() =>
                patchRun(run.id, { status: run.status === "active" ? "done" : "active" })
                  .then(setRun)
                  .catch((err) => toast.error(errMsg(err, "更新できませんでした")))
              }
            >
              {run.status === "active" ? "終了にする" : "再開"}
            </button>
          </>
        }
      />
      <p className="-mt-4 mb-4 text-[15px] text-label-2">
        {[run.run_date, run.location].filter(Boolean).join(" · ") || "—"}
        {run.status === "done" && <span className={`ml-2 rounded-sm px-1.5 py-0.5 text-[12px] font-semibold ${BADGE.gray}`}>終了</span>}
      </p>

      <Segmented<Tab>
        className="mb-4 w-full max-w-md"
        value={tab}
        onChange={setTab}
        ariaLabel="表示"
        options={[
          { value: "work", label: runningCount ? `作業時間（${runningCount}）` : "作業時間" },
          { value: "log", label: "記録" },
          { value: "report", label: "まとめ" },
        ]}
      />

      {tab === "work" && <WorkPanel run={run} work={work} now={now} />}
      {tab === "log" && <LogPanel run={run} logs={logs} />}
      {tab === "report" && <ReportPanel run={run} work={work} logs={logs} now={now} />}

      <div className="mt-8 text-center">
        <button
          type="button"
          className="text-[15px] text-danger"
          onClick={() => {
            if (!confirmDelete(run.title)) return;
            deleteRun(run.id)
              .then(() => {
                toast.success(`「${run.title}」をゴミ箱に移しました`);
                router.push("/test-runs");
              })
              .catch((err) => toast.error(errMsg(err, "削除できませんでした")));
          }}
        >
          この活動ログをゴミ箱に移す
        </button>
      </div>

      <EditSheet run={run} open={editOpen} onClose={() => setEditOpen(false)} onRun={setRun} />
    </div>
  );
}
