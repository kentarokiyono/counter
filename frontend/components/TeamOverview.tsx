"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/AccountSheet";
import { useTasks } from "@/hooks/useTasks";
import { OnlineMember, fetchOnline } from "@/lib/activityApi";
import { Survey, listSurveys } from "@/lib/stickersApi";
import { dueState } from "@/lib/taskUi";

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

function usePolling<T>(fn: () => Promise<T>, ms: number, initial: T): T {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    let cancelled = false;
    const load = () => fn().then((v) => !cancelled && setValue(v)).catch(() => {});
    load();
    const t = setInterval(load, ms);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms]);
  return value;
}

function OnlineWidget() {
  const online = usePolling<OnlineMember[]>(fetchOnline, 60000, []);
  return (
    <section className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3">
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
      </span>
      <span className="shrink-0 text-[15px] font-semibold">オンライン {online.length}</span>
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
        {online.map((o) => (
          <span key={o.name} className="flex shrink-0 items-center gap-1.5 rounded-full bg-fill py-0.5 pl-0.5 pr-2.5 text-[13px]">
            <Avatar name={o.name} size={22} />
            {o.name}
          </span>
        ))}
        {online.length === 0 && <span className="text-[13px] text-label-2">今はいません</span>}
      </div>
    </section>
  );
}

function StickerWidget({ surveys }: { surveys: Survey[] | null }) {
  const total = (surveys ?? []).reduce((n, s) => n + (s.total ?? 0), 0);
  const recent = (surveys ?? []).slice(0, 4);
  const max = Math.max(1, ...recent.map((s) => s.total ?? 0));
  return (
    <Widget title="シール集計" href="/stickers">
      {!surveys ? (
        <p className="text-[15px] text-label-3">読み込み中...</p>
      ) : surveys.length === 0 ? (
        <Link href="/stickers" className="ios-btn-gray">
          ＋ シール集計を始める
        </Link>
      ) : (
        <>
          <p className="text-[12px] text-label-2">これまでの合計</p>
          <p className="tabular-nums text-[24px] font-bold">{total.toLocaleString()}枚</p>
          <ul className="mt-3 space-y-2">
            {recent.map((s) => (
              <li key={s.id}>
                <Link href={`/stickers/${s.id}`} className="block active:opacity-70">
                  <div className="flex justify-between gap-2 text-[13px]">
                    <span className="truncate">{s.title}</span>
                    <span className="tabular-nums shrink-0 text-label-2">{(s.total ?? 0).toLocaleString()}枚</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-fill">
                    <div className="h-full rounded-full bg-p-teal-bar" style={{ width: `${((s.total ?? 0) / max) * 100}%` }} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Widget>
  );
}

/** 統計「チーム」の上部: いまの状況（オンライン・件数・シール集計） */
export default function TeamOverview() {
  const { tasks, loading } = useTasks();
  const surveys = usePolling<Survey[] | null>(listSurveys, 60000, null);
  const activeSurveys = surveys ? surveys.filter((s) => s.status === "active").length : null;
  const open = useMemo(() => tasks.filter((t) => t.status !== "done"), [tasks]);
  const overdue = open.filter((t) => dueState(t) === "overdue").length;
  const unassigned = open.filter((t) => !t.assignee_name).length;

  const stat = (label: string, value: React.ReactNode, href: string, color?: string) => (
    <Link href={href} className="rounded-2xl bg-card px-4 py-3 active:opacity-70">
      <p className="text-[13px] text-label-2">{label}</p>
      <p className="tabular-nums mt-0.5 text-[28px] font-bold leading-tight" style={color ? { color } : undefined}>
        {value}
      </p>
    </Link>
  );

  return (
    <div className="mb-6 space-y-4">
      <OnlineWidget />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stat("未完了タスク", loading ? "–" : open.length, "/tasks")}
        {stat("期限切れ", loading ? "–" : overdue, "/tasks", overdue > 0 ? "var(--danger)" : undefined)}
        {stat("未割当", loading ? "–" : unassigned, "/tasks")}
        {stat("集計中のシール", activeSurveys ?? "–", "/stickers")}
      </div>
      <StickerWidget surveys={surveys} />
    </div>
  );
}
