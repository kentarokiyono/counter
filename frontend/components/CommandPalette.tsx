"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MORE_ITEMS, OPS_ITEMS, visibleFor } from "@/lib/nav";
import { useIsAdmin } from "@/lib/self";
import { fetchTasks } from "@/lib/api";
import { fetchEvents } from "@/lib/eventApi";
import { Event } from "@/lib/eventTypes";
import { getJson } from "@/lib/http";
import { Survey, listSurveys } from "@/lib/stickersApi";
import { TestRun, listRuns } from "@/lib/testRunApi";
import { Task, TASK_STATUS_LABELS } from "@/lib/types";

type Group = "ページ" | "タスク" | "コメント" | "イベント" | "シール集計" | "活動ログ";

interface CommentHit {
  id: string;
  task_id: string;
  task_title: string;
  author: string;
  body: string;
}

interface Item {
  key: string;
  label: string;
  sub?: string;
  group: Group;
  href: string;
}

const pageItems = (isAdmin: boolean): Item[] =>
  [...OPS_ITEMS, ...visibleFor(MORE_ITEMS, isAdmin)].map((n) => ({
    key: `page:${n.href}`,
    label: n.label,
    group: "ページ",
    href: n.href,
  }));

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFKC");
}

const md = (d: string) => new Date(d).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });

export default function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const isAdmin = useIsAdmin();
  const [query, setQuery] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [comments, setComments] = useState<CommentHit[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
    fetchTasks().then(setTasks).catch(() => setTasks([]));
    fetchEvents().then(setEvents).catch(() => setEvents([]));
    listSurveys().then(setSurveys).catch(() => setSurveys([]));
    listRuns().then(setRuns).catch(() => setRuns([]));
  }, [open]);

  // コメントは件数が多くなるのでサーバーで探す（入力が止まってから）
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) {
      setComments([]);
      return;
    }
    const timer = window.setTimeout(() => {
      getJson<CommentHit[]>(`/api/search/comments?q=${encodeURIComponent(q)}`)
        .then(setComments)
        .catch(() => setComments([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [open, query]);

  const results = useMemo(() => {
    const q = normalize(query.trim());
    const match = (text: string) => normalize(text).includes(q);
    const pages = q ? pageItems(isAdmin).filter((p) => match(p.label)) : pageItems(isAdmin);
    if (!q) return pages;
    const taskItems: Item[] = tasks
      .filter((t) => match(`${t.title} ${t.description ?? ""} ${t.assignee_name ?? ""}`))
      .slice(0, 8)
      .map((t) => ({
        key: `task:${t.id}`,
        label: t.title,
        sub: [TASK_STATUS_LABELS[t.status], t.assignee_name, t.due_date && `期限 ${t.due_date}`].filter(Boolean).join(" · "),
        group: "タスク",
        href: `/tasks?task=${t.id}`,
      }));
    const commentItems: Item[] = comments.slice(0, 5).map((c) => ({
      key: `comment:${c.id}`,
      label: c.body.length > 60 ? `${c.body.slice(0, 60)}…` : c.body,
      sub: `${c.task_title} · ${c.author}`,
      group: "コメント",
      href: `/tasks?task=${c.task_id}`,
    }));
    const eventItems: Item[] = events
      .filter((e) => match(`${e.title} ${e.location ?? ""} ${e.description ?? ""}`))
      .slice(0, 5)
      .map((e) => ({
        key: `event:${e.id}`,
        label: e.title,
        sub: [md(e.start_time), e.location].filter(Boolean).join(" · "),
        group: "イベント",
        href: `/events?event=${e.id}`,
      }));
    const surveyItems: Item[] = surveys
      .filter((s) => match(`${s.title} ${s.location ?? ""}`))
      .slice(0, 5)
      .map((s) => ({
        key: `survey:${s.id}`,
        label: s.title,
        sub: [s.survey_date && md(s.survey_date), s.location, `${s.total ?? 0}枚`].filter(Boolean).join(" · "),
        group: "シール集計",
        href: `/stickers/${s.id}`,
      }));
    const runItems: Item[] = runs
      .filter((r) => match(`${r.title} ${r.location ?? ""}`))
      .slice(0, 5)
      .map((r) => ({
        key: `run:${r.id}`,
        label: r.title,
        sub: [r.run_date && md(r.run_date), r.location].filter(Boolean).join(" · "),
        group: "活動ログ",
        href: `/test-runs/${r.id}`,
      }));
    return [...pages, ...taskItems, ...commentItems, ...eventItems, ...surveyItems, ...runItems];
  }, [query, tasks, events, surveys, runs, comments, isAdmin]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  function go(item: Item | undefined) {
    if (!item) return;
    onClose();
    router.push(item.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[active]);
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  let lastGroup = "";

  return (
    <div
      className="fixed inset-0 z-60 flex items-start justify-center bg-black/40 p-4 pt-[12vh]"
      onClick={onClose}
    >
      <div
        className="app-surface w-full max-w-lg overflow-hidden rounded-2xl border border-separator bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="検索・移動"
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="ページ・タスク・イベント・シール集計・活動ログを検索"
          className="w-full border-0 border-b border-separator bg-transparent px-4 py-3 text-sm outline-hidden"
        />
        <ul ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
          {results.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-label-3">見つかりません</li>
          )}
          {results.map((item, i) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <li key={item.key}>
                {header && (
                  <p className="px-4 pb-1 pt-2 text-[11px] font-medium text-label-3">{header}</p>
                )}
                <button
                  type="button"
                  data-index={i}
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(item)}
                  className={`flex w-full flex-col items-start px-4 py-2 text-left ${
                    i === active ? "bg-accent-soft" : ""
                  }`}
                >
                  <span className="text-sm text-label">{item.label}</span>
                  {item.sub && <span className="text-xs text-label-2">{item.sub}</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="border-t border-separator px-4 py-2 text-[11px] text-label-3">
          ↑↓ で選択 · Enter で移動 · Esc で閉じる
        </p>
      </div>
    </div>
  );
}
