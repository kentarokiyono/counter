"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { TaskCardBody } from "@/components/TaskBoard";
import { Avatar } from "@/components/AccountSheet";
import { useTasks } from "@/hooks/useTasks";
import { useEvents } from "@/hooks/useEvents";
import { useIsAdmin, useSelf } from "@/lib/self";
import { greeting } from "@/lib/greeting";
import { holidayName } from "@/lib/holidays";
import { ActivityEntry, daysUntil, listActivity, relativeTime } from "@/lib/homeApi";
import { applyLive, subscribeLive } from "@/lib/live";
import { COLOR_HEX, Survey, listSurveys } from "@/lib/stickersApi";
import { dueState } from "@/lib/taskUi";
import { Task } from "@/lib/types";
import type { Event } from "@/lib/eventTypes";

const UPCOMING_DAYS = 7;

function byDue(a: Task, b: Task): number {
  if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
  if (a.due_date) return -1;
  if (b.due_date) return 1;
  return 0;
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
}

function formatEventTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ja-JP", {
      month: "numeric",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** iOS ウィジェット風のカード */
function Widget({
  title,
  href,
  action,
  children,
  className = "",
}: {
  title: string;
  href?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl bg-card p-4 ${className}`}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-label">{title}</h2>
        {action ??
          (href && (
            <Link href={href} className="ios-btn-plain text-[15px]">
              すべて
            </Link>
          ))}
      </div>
      {children}
    </section>
  );
}

/** 次のイベントまでの日数（中止・完了を除く、まだ始まっていないもの） */
function CountdownWidget({ events }: { events: Event[] }) {
  const upcoming = useMemo(
    () =>
      events
        .filter((e) => e.status !== "cancelled" && e.status !== "completed")
        .filter((e) => daysUntil(ymd(new Date(e.start_time))) >= 0)
        .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [events]
  );
  const next = upcoming[0];
  const days = next ? daysUntil(ymd(new Date(next.start_time))) : 0;

  return (
    <section className="relative overflow-hidden rounded-2xl bg-linear-to-br from-p-teal to-p-blue p-5 text-accent-ink">
      <p className="text-[13px] font-semibold">次のイベント</p>
      {next ? (
        <Link href={`/events?event=${next.id}`} className="block active:opacity-70">
          <p className="mt-2 truncate text-[13px] opacity-75">{next.title}まで</p>
          <div className="flex items-baseline gap-1.5">
            <span className="tabular-nums text-[56px] font-bold leading-none tracking-tight">{days === 0 ? "今日" : days}</span>
            {days !== 0 && <span className="text-[17px] font-semibold">日</span>}
          </div>
          <p className="mt-1 text-[13px] opacity-75">
            {formatDate(ymd(new Date(next.start_time)))}
            {next.location ? ` · ${next.location}` : ""}
          </p>
        </Link>
      ) : (
        <Link
          href="/events"
          className="mt-4 inline-block rounded-full bg-card/70 px-4 py-2 text-[15px] font-semibold text-accent-ink active:opacity-70"
        >
          ＋ イベントを登録
        </Link>
      )}
      {upcoming.length > 1 && (
        <ul className="mt-4 space-y-1 border-t border-separator pt-3">
          {upcoming.slice(1, 4).map((e) => {
            const d = daysUntil(ymd(new Date(e.start_time)));
            return (
              <li key={e.id} className="flex justify-between gap-2 text-[13px]">
                <span className="truncate opacity-90">{e.title}</span>
                <span className="tabular-nums shrink-0 opacity-75">{d === 0 ? "今日" : `あと${d}日`}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** 集計中のシール集計（すぐ数え始められるように） */
function StickerWidget() {
  const [items, setItems] = useState<Survey[] | null>(null);
  useEffect(() => {
    const load = () => listSurveys().then(setItems).catch(() => setItems([]));
    load();
    let timer: number | undefined;
    // 数が変わるたびに再取得すると多いので、まとめて読み直す
    const later = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(load, 1500);
    };
    const offSurveys = subscribeLive("sticker_surveys", later, load);
    const offCounts = subscribeLive("sticker_counts", later);
    return () => {
      window.clearTimeout(timer);
      offSurveys();
      offCounts();
    };
  }, []);
  const active = (items ?? []).filter((s) => s.status === "active").slice(0, 3);
  return (
    <Widget title="シール集計" href="/stickers">
      {items === null ? (
        <p className="text-[15px] text-label-3">読み込み中...</p>
      ) : active.length === 0 ? (
        <Link href="/stickers?new=1" className="ios-btn-gray">
          ＋ 集計を始める
        </Link>
      ) : (
        <ul className="-mx-1 space-y-1.5">
          {active.map((s) => (
            <li key={s.id}>
              <Link href={`/stickers/${s.id}`} className="flex items-center gap-3 rounded-xl bg-fill px-3 py-2.5 active:opacity-70">
                <span className="flex shrink-0 -space-x-1" aria-hidden>
                  {s.colors.slice(0, 4).map((c) => (
                    <span key={c.key} className="h-3.5 w-3.5 rounded-full ring-2 ring-card" style={{ background: COLOR_HEX[c.key] }} />
                  ))}
                </span>
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{s.title}</span>
                <span className="tabular-nums shrink-0 text-[15px] font-semibold">{(s.total ?? 0).toLocaleString()}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Widget>
  );
}

function ActivityWidget() {
  const [items, setItems] = useState<ActivityEntry[]>([]);
  useEffect(() => {
    const load = () => listActivity(5).then(setItems).catch(() => {});
    load();
    return subscribeLive(
      "activity_log",
      (ev, row) => setItems((prev) => applyLive(prev, ev, row).slice(0, 5)),
      load
    );
  }, []);
  return (
    <Widget title="最近の動き" href="/log">
      {items.length === 0 ? (
        <p className="text-[15px] text-label-2">まだ記録がありません。</p>
      ) : (
        <ul className="space-y-3">
          {items.map((a) => (
            <li key={a.id} className="flex gap-2.5">
              <Avatar name={a.actor} size={28} />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] leading-snug">
                  <span className="font-semibold">{a.actor}</span> {a.summary}
                </p>
                <p className="text-[12px] text-label-3">{relativeTime(a.created_at)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Widget>
  );
}

function TaskList({ tasks, empty }: { tasks: Task[]; empty: string }) {
  if (tasks.length === 0) return <p className="text-[15px] text-label-2">{empty}</p>;
  return (
    <ul className="-mx-1 space-y-1.5">
      {tasks.map((t) => (
        <li key={t.id}>
          <Link
            href={`/tasks?task=${t.id}`}
            className={`block rounded-xl bg-fill px-3 py-2 text-[15px] active:opacity-70 ${
              dueState(t) === "overdue" ? "border-l-4 border-p-red-bar" : ""
            }`}
          >
            <TaskCardBody task={t} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 今日から7日分の予定（イベントと期限のタスク） */
function WeekStrip({ events, tasks }: { events: Event[]; tasks: Task[] }) {
  const days = useMemo(() => {
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const key = ymd(d);
      const dayEvents = events.filter((e) => {
        if (e.status === "cancelled") return false;
        const start = ymd(new Date(e.start_time));
        const end = e.end_time ? ymd(new Date(e.end_time)) : start;
        return start <= key && key <= end;
      });
      const due = tasks.filter((t) => t.status !== "done" && t.due_date === key).length;
      return { d, key, dayEvents, due, holiday: holidayName(key) };
    });
  }, [events, tasks]);

  return (
    <section className="mb-4 rounded-2xl bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-label">今週の予定</h2>
        <Link href="/events?view=calendar" className="ios-btn-plain text-[15px]">
          カレンダー
        </Link>
      </div>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 md:grid md:grid-cols-7 md:overflow-visible">
        {days.map(({ d, key, dayEvents, due, holiday }, i) => {
          const wd = d.getDay();
          return (
            <Link
              key={key}
              href="/events?view=calendar"
              className={`flex min-h-[92px] w-[30%] shrink-0 flex-col rounded-xl px-2 py-2 active:opacity-70 md:w-auto ${
                i === 0 ? "bg-accent-soft" : "bg-fill"
              }`}
            >
              <span
                className={`text-[12px] font-semibold ${
                  wd === 0 || holiday ? "text-p-red-ink" : wd === 6 ? "text-p-blue-ink" : "text-label-2"
                }`}
              >
                {i === 0 ? "今日" : `${d.getMonth() + 1}/${d.getDate()}`}（{WEEKDAYS[wd]}）
              </span>
              <span className="mt-1 space-y-1">
                {holiday && <span className="block truncate text-[11px] font-medium text-p-red-ink">{holiday}</span>}
                {dayEvents.slice(0, 2).map((e) => (
                  <span key={e.id} className="block truncate rounded-md bg-p-blue px-1.5 py-0.5 text-[12px] font-medium text-p-blue-ink">
                    {e.title}
                  </span>
                ))}
                {dayEvents.length > 2 && <span className="block text-[12px] text-label-2">ほか{dayEvents.length - 2}件</span>}
              </span>
              {due > 0 && <span className="mt-auto pt-1 text-[12px] font-medium text-p-orange-ink">締切 {due}件</span>}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/** チーム全体のタスクの状況 */
function TeamStatusWidget({ tasks }: { tasks: Task[] }) {
  const open = tasks.filter((t) => t.status !== "done");
  const overdue = open.filter((t) => dueState(t) === "overdue").length;
  const cells: { label: string; value: number; tone: string }[] = [
    { label: "未着手", value: open.filter((t) => t.status === "todo").length, tone: "bg-p-gray text-p-gray-ink" },
    { label: "進行中", value: open.filter((t) => t.status === "in_progress").length, tone: "bg-p-blue text-p-blue-ink" },
    { label: "確認待ち", value: open.filter((t) => t.status === "review").length, tone: "bg-p-purple text-p-purple-ink" },
    { label: "期限切れ", value: overdue, tone: overdue > 0 ? "bg-p-red text-p-red-ink" : "bg-p-gray text-p-gray-ink" },
  ];
  return (
    <Widget title="チームの状況" href="/tasks">
      <div className="grid grid-cols-4 gap-1.5">
        {cells.map((c) => (
          <Link key={c.label} href="/tasks" className={`rounded-xl px-2 py-2.5 text-center active:opacity-70 ${c.tone}`}>
            <span className="block text-[22px] font-bold leading-none tabular-nums">{c.value}</span>
            <span className="mt-1 block text-[12px] font-medium">{c.label}</span>
          </Link>
        ))}
      </div>
    </Widget>
  );
}

export default function Home() {
  const self = useSelf();
  // 開いたままでも挨拶が時間帯に合うよう、1分ごとに時刻を更新する
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const isAdmin = useIsAdmin();
  const { tasks, loading: tasksLoading } = useTasks();
  const { events, loading: eventsLoading } = useEvents();

  // 今日やること: 自分の未完了タスク（期限切れ→期限が近い順）
  const mine = useMemo(() => {
    const rank = (t: Task) => ({ overdue: 0, soon: 1, normal: 2, none: 3 })[dueState(t)];
    return tasks
      .filter((t) => t.status !== "done" && t.assignee_name === self)
      .sort((a, b) => rank(a) - rank(b) || byDue(a, b));
  }, [tasks, self]);

  // 自分の分が無いときに代わりに出す: 担当者がいない未完了タスク（期限が近い順）
  const unassigned = useMemo(
    () => tasks.filter((t) => t.status !== "done" && !t.assignee_name).sort(byDue).slice(0, 4),
    [tasks]
  );

  // 期限が近い（3日以内・期限切れ）チーム全員のタスク。自分の分は「今日やること」に出るので除く
  const dueSoon = useMemo(
    () =>
      tasks
        .filter((t) => t.status !== "done" && t.assignee_name !== self)
        .filter((t) => dueState(t) === "overdue" || dueState(t) === "soon")
        .sort(byDue),
    [tasks, self]
  );

  const upcoming = useMemo(() => {
    const now = Date.now();
    const limit = now + UPCOMING_DAYS * 86400000;
    return events
      .filter((e) => e.status !== "cancelled" && e.status !== "completed")
      .filter((e) => {
        const start = new Date(e.start_time).getTime();
        const end = e.end_time ? new Date(e.end_time).getTime() : start;
        return end >= now && start <= limit;
      })
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
      .slice(0, 4);
  }, [events]);

  return (
    <div className="mx-auto max-w-7xl">
      <h1 className="mb-4 text-[28px] font-bold leading-tight tracking-tight md:text-[34px]">
        {self ? greeting(self, clock) : "ホーム"}
      </h1>

      <WeekStrip events={events} tasks={tasks} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <div className="space-y-4">
          <Widget title="今日やること" href="/tasks">
            {tasksLoading ? (
              <p className="text-[15px] text-label-3">読み込み中...</p>
            ) : (
              <>
                {mine.length === 0 ? (
                  <>
                    <p className="mb-2 text-[15px] font-medium">自分の担当はありません</p>
                    {unassigned.length > 0 && (
                      <>
                        <h3 className="mb-1.5 text-[13px] font-semibold text-label-2">担当者がいないタスク</h3>
                        <div className="mb-2">
                          <TaskList tasks={unassigned} empty="" />
                        </div>
                      </>
                    )}
                    <Link href="/tasks" className="ios-btn-gray">
                      ＋ タスクを追加
                    </Link>
                  </>
                ) : (
                  <TaskList tasks={mine.slice(0, 6)} empty="" />
                )}
              </>
            )}
          </Widget>

          {dueSoon.length > 0 && (
            <Widget title="期限が近いタスク" href="/tasks">
              <TaskList tasks={dueSoon.slice(0, 6)} empty="" />
            </Widget>
          )}
        </div>

        <div className="space-y-4">
          <Widget title="近いイベント" href="/events">
            {eventsLoading ? (
              <p className="text-[15px] text-label-3">読み込み中...</p>
            ) : upcoming.length === 0 ? (
              <p className="text-[15px] text-label-2">予定はありません</p>
            ) : (
              <ul className="-mx-1 space-y-1.5">
                {upcoming.map((e) => {
                  const done = e.checklist.filter((c) => c.done).length;
                  const answer = e.attendance?.[self];
                  return (
                    <li key={e.id}>
                      <Link href="/events" className="block rounded-xl bg-fill px-3 py-2 active:opacity-70">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[15px] font-medium">{e.title}</p>
                          {answer === "yes" && (
                            <span className="shrink-0 rounded-md bg-p-green px-1.5 py-0.5 text-[11px] font-semibold text-p-green-ink">参加</span>
                          )}
                          {!answer && (
                            <span className="shrink-0 rounded-md bg-p-orange px-1.5 py-0.5 text-[11px] font-semibold text-p-orange-ink">出欠未回答</span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[13px] text-label-2">
                          {formatEventTime(e.start_time)}
                          {e.location ? ` · ${e.location}` : ""}
                          {e.checklist.length > 0 ? ` · 準備 ${done}/${e.checklist.length}` : ""}
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Widget>

          <TeamStatusWidget tasks={tasks} />
        </div>

        <div className="space-y-4 lg:col-span-2 xl:col-span-1">
          <CountdownWidget events={events} />
          <StickerWidget />
          {isAdmin && <ActivityWidget />}
        </div>
      </div>
    </div>
  );
}
