"use client";

import { useEffect, useMemo, useState } from "react";
import { Event } from "@/lib/eventTypes";
import { API_BASE } from "@/lib/auth";
import { getJson } from "@/lib/http";
import { useToast } from "@/components/Toast";
import { BADGE, BAR, Tone } from "@/lib/palette";
import { holidayName } from "@/lib/holidays";

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** イベントが掛かる日（開始〜終了）のキー一覧 */
function daysOf(e: Event): string[] {
  const start = new Date(e.start_time);
  const end = e.end_time ? new Date(e.end_time) : start;
  const out: string[] = [];
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  for (let i = 0; d <= last && i < 60; i++) {
    out.push(ymd(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

const STATUS_TONE: Record<string, Tone> = {
  planned: "gray",
  confirmed: "blue",
  in_progress: "orange",
  completed: "green",
  cancelled: "red",
};

/** 月表示カレンダー（iOS のカレンダー風）。日付を押すとその日のイベントを下に出す */
export default function EventCalendar({
  events,
  renderEvent,
}: {
  events: Event[];
  renderEvent: (e: Event) => React.ReactNode;
}) {
  const today = ymd(new Date());
  const [month, setMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [selected, setSelected] = useState(today);

  const byDay = useMemo(() => {
    const map = new Map<string, Event[]>();
    for (const e of events) for (const d of daysOf(e)) map.set(d, [...(map.get(d) ?? []), e]);
    return map;
  }, [events]);

  const cells = useMemo(() => {
    const first = new Date(month);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [month]);

  const move = (delta: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  const dayEvents = byDay.get(selected) ?? [];

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-card p-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-[20px] font-bold">
            {month.getFullYear()}年{month.getMonth() + 1}月
          </h2>
          <div className="flex items-center gap-4">
            <button type="button" className="ios-btn-plain" onClick={() => {
              const n = new Date();
              setMonth(new Date(n.getFullYear(), n.getMonth(), 1));
              setSelected(today);
            }}>
              今日
            </button>
            <button type="button" className="ios-btn-plain text-[20px]" aria-label="前の月" onClick={() => move(-1)}>
              ‹
            </button>
            <button type="button" className="ios-btn-plain text-[20px]" aria-label="次の月" onClick={() => move(1)}>
              ›
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-label-2">
          {WEEK.map((w, i) => (
            <div key={w} className={`py-1 ${i === 0 ? "text-p-red-ink" : i === 6 ? "text-p-blue-ink" : ""}`}>
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d) => {
            const key = ymd(d);
            const inMonth = d.getMonth() === month.getMonth();
            const list = byDay.get(key) ?? [];
            const isSel = key === selected;
            const isToday = key === today;
            const holiday = holidayName(key);
            const red = holiday || d.getDay() === 0;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelected(key)}
                className={`flex min-h-[52px] flex-col items-center border-t border-separator px-0.5 pb-1 pt-1 md:min-h-[84px] md:items-stretch ${inMonth ? "" : "opacity-35"}`}
              >
                <span
                  className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full text-[15px] tabular-nums ${
                    isSel ? (isToday ? "bg-[#e5534b] font-bold text-white" : "bg-label font-bold text-card") : isToday ? "font-bold text-[#e5534b]" : red ? "text-p-red-ink" : ""
                  }`}
                  title={holiday ?? undefined}
                >
                  {d.getDate()}
                </span>
                {/* スマホは点、PCはタイトル */}
                <span className="mt-1 flex w-full flex-col gap-[3px] px-0.5 md:hidden">
                  {list.slice(0, 3).map((e) => (
                    <span key={e.id} className="h-[5px] w-full rounded-full" style={{ background: BAR[STATUS_TONE[e.status]] }} />
                  ))}
                  {list.length > 3 && <span className="text-[9px] text-label-2">+{list.length - 3}</span>}
                </span>
                <span className="mt-0.5 hidden space-y-0.5 md:block">
                  {holiday && <span className="block truncate text-left text-[10px] font-medium text-p-red-ink">{holiday}</span>}
                  {list.slice(0, 2).map((e) => (
                    <span
                      key={e.id}
                      className={`block truncate rounded-sm px-1 text-left text-[11px] font-medium ${BADGE[STATUS_TONE[e.status]]}`}
                    >
                      {e.title}
                    </span>
                  ))}
                  {list.length > 2 && <span className="block text-left text-[10px] text-label-2">ほか{list.length - 2}件</span>}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="px-4 pb-1.5 text-[13px] font-semibold text-label-2">
          {new Date(selected + "T00:00:00").toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" })}
          {holidayName(selected) && <span className="ml-2 text-p-red-ink">{holidayName(selected)}</span>}
        </h3>
        {dayEvents.length === 0 ? (
          <p className="rounded-xl bg-card px-4 py-4 text-[15px] text-label-2">予定はありません</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{dayEvents.map((e) => renderEvent(e))}</div>
        )}
      </section>

      <CalendarSubscribe />
    </div>
  );
}

/** Googleカレンダー・iPhoneのカレンダーから購読するためのURL */
function CalendarSubscribe() {
  const toast = useToast();
  const [path, setPath] = useState<string | null>(null);
  useEffect(() => {
    getJson<{ enabled: boolean; path: string | null }>("/api/calendar/feed-url")
      .then((r) => setPath(r.enabled ? r.path : null))
      .catch(() => setPath(null));
  }, []);
  if (!path) return null;
  const url = `${API_BASE}${path}`;
  const webcal = url.replace(/^https?:/, "webcal:");
  return (
    <section className="rounded-2xl bg-card p-4">
      <h3 className="text-[15px] font-semibold">カレンダーアプリで見る</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="ios-btn-gray"
          onClick={() =>
            navigator.clipboard
              .writeText(url)
              .then(() => toast.success("URLをコピーしました"))
              .catch(() => toast.error("コピーできませんでした"))
          }
        >
          URLをコピー
        </button>
        <a href={webcal} className="ios-btn">
          購読（iPhone・Mac）
        </a>
      </div>
    </section>
  );
}
