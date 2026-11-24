"use client";

import { useEffect, useState } from "react";
import { undoDelete } from "@/lib/undo";
import ModulePageHeader from "@/components/ModulePageHeader";
import CsvButton from "@/components/CsvButton";
import EventModal from "@/components/EventModal";
import EventCalendar from "@/components/EventCalendar";
import Segmented from "@/components/ui/Segmented";
import { useToast } from "@/components/Toast";
import { Avatar } from "@/components/AccountSheet";
import { useSelf } from "@/lib/self";
import { useEvents } from "@/hooks/useEvents";
import { createEvent, updateEvent, deleteEvent, setAttendance } from "@/lib/eventApi";
import {
  Event,
  EventCreateInput,
  EventStatus,
  EVENT_STATUS_LABELS,
  EVENT_STATUS_COLORS,
  Attendance,
} from "@/lib/eventTypes";
import { confirmDelete } from "@/lib/confirmDelete";
import ItemHistory from "@/components/ItemHistory";

const STATUS_OPTIONS = Object.entries(EVENT_STATUS_LABELS) as [
  EventStatus,
  string
][];

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ja-JP", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function EventCard({
  event,
  onLocalUpdate,
  onLocalRemove,
}: {
  event: Event;
  onLocalUpdate: (e: Event) => void;
  onLocalRemove: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  async function changeStatus(status: EventStatus) {
    setBusy(true);
    setError(null);
    try {
      const updated = await updateEvent(event.id, { status });
      onLocalUpdate(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function toggleChecklist(index: number) {
    const nextChecklist = event.checklist.map((c, i) => (i === index ? { ...c, done: !c.done } : c));
    // その場ですぐ反映し、失敗したら戻す（現場で連打しても待たされないように）
    onLocalUpdate({ ...event, checklist: nextChecklist });
    try {
      const updated = await updateEvent(event.id, { checklist: nextChecklist });
      onLocalUpdate(updated);
    } catch (err) {
      onLocalUpdate(event);
      toast.error(err instanceof Error ? err.message : "更新に失敗しました");
    }
  }

  async function handleDelete() {
    if (!confirmDelete(event.title)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteEvent(event.id);
      onLocalRemove(event.id);
      toast.success(`「${event.title}」をゴミ箱に移しました`, undoDelete("events", event.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
      setBusy(false);
    }
  }

  const done = event.checklist.filter((c) => c.done).length;
  const self = useSelf();
  const attendance = event.attendance ?? {};
  const mine = attendance[self] ?? null;
  const going = Object.entries(attendance).filter(([, v]) => v === "yes").map(([n]) => n);
  const maybe = Object.entries(attendance).filter(([, v]) => v === "maybe").length;
  const notGoing = Object.entries(attendance).filter(([, v]) => v === "no").length;

  async function answer(status: Attendance) {
    const next = mine === status ? null : status;
    const nextAttendance = { ...attendance };
    if (next) nextAttendance[self] = next;
    else delete nextAttendance[self];
    onLocalUpdate({ ...event, attendance: nextAttendance });
    try {
      onLocalUpdate(await setAttendance(event.id, next));
    } catch (err) {
      onLocalUpdate(event);
      toast.error(err instanceof Error ? err.message : "出欠を登録できませんでした");
    }
  }

  return (
    <div id={`event-${event.id}`} className="scroll-mt-20 overflow-hidden rounded-2xl bg-card">
      <div className="flex items-start justify-between gap-2 p-4 pb-3">
        <div className="min-w-0">
          <p className="text-[17px] font-semibold">{event.title}</p>
          <p className="mt-0.5 text-[13px] text-label-2">
            {formatDateTime(event.start_time)}
            {event.end_time ? ` 〜 ${formatDateTime(event.end_time)}` : ""}
            {event.location ? ` · ${event.location}` : ""}
          </p>
          {event.assignees.length > 0 && (
            <p className="mt-0.5 text-[13px] text-label-2">担当: {event.assignees.join("、")}</p>
          )}
        </div>
        <select
          className={`shrink-0 rounded-lg border-0 px-2 py-1 text-[13px] font-semibold ${EVENT_STATUS_COLORS[event.status]}`}
          value={event.status}
          disabled={busy}
          onChange={(e) => changeStatus(e.target.value as EventStatus)}
          aria-label="状態"
        >
          {STATUS_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {event.description && <p className="px-4 pb-3 text-[15px] text-label-2">{event.description}</p>}

      {event.status !== "cancelled" && event.status !== "completed" && (
        <div className="border-t border-separator px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] text-label-2">出欠</span>
            <span className="text-[13px] text-label-2">
              参加 <b className="text-label">{going.length}</b>・未定 {maybe}・不参加 {notGoing}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["yes", "参加"],
                ["maybe", "未定"],
                ["no", "不参加"],
              ] as [Attendance, string][]
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                aria-pressed={mine === v}
                onClick={() => answer(v)}
                className={`h-10 rounded-xl text-[15px] font-semibold ${
                  mine === v
                    ? v === "yes"
                      ? "bg-p-green text-p-green-ink"
                      : v === "no"
                        ? "bg-p-red text-p-red-ink"
                        : "bg-p-orange text-p-orange-ink"
                    : "bg-fill text-label"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {going.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {going.map((n) => (
                <span key={n} className="flex items-center gap-1 rounded-full bg-fill py-0.5 pl-0.5 pr-2 text-[12px]">
                  <Avatar name={n} size={18} />
                  {n}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {event.checklist.length > 0 && (
        <div className="border-t border-separator">
          <div className="flex items-center justify-between px-4 pb-1 pt-2.5">
            <span className="text-[13px] text-label-2">持ち物・準備</span>
            <span className={`tabular-nums text-[13px] font-semibold ${done === event.checklist.length ? "text-success" : "text-label-2"}`}>
              {done}/{event.checklist.length}
            </span>
          </div>
          <ul>
            {event.checklist.map((c, i) => (
              <li key={i}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={c.done}
                  onClick={() => toggleChecklist(i)}
                  className="flex min-h-[48px] w-full items-center gap-3 px-4 text-left active:bg-fill"
                >
                  <span
                    className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                      c.done ? "border-accent bg-accent-soft text-accent-ink" : "border-label-3"
                    }`}
                  >
                    {c.done && (
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m5 12 5 5 9-10" />
                      </svg>
                    )}
                  </span>
                  <span className={`flex-1 border-b border-separator py-3 text-[16px] ${c.done ? "text-label-3 line-through" : ""}`}>
                    {c.item}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="px-4 pb-2 text-[13px] text-danger">{error}</p>}

      <ItemHistory kind="events" id={event.id} />
      <div className="border-t border-separator px-4 py-2.5 text-right">
        <button className="text-[15px] text-danger disabled:opacity-50" onClick={handleDelete} disabled={busy}>
          ゴミ箱に移す
        </button>
      </div>
    </div>
  );
}

export default function EventsPage() {
  const { events, loading, error, applyLocalUpdate, removeLocal } = useEvents();
  const [modalOpen, setModalOpen] = useState(false);
  const [view, setView] = useState<"list" | "calendar">("list");
  const toast = useToast();

  useEffect(() => {
    try {
      // ホームの「今週の予定」から来たときは ?view=calendar で開く
      const fromUrl = new URLSearchParams(window.location.search).get("view");
      const v = fromUrl ?? localStorage.getItem("toloc_events_view");
      if (v === "calendar" || v === "list") setView(v);
    } catch {
      // noop
    }
  }, []);

  // ?event=<id> で開かれた場合（検索から）はリスト表示でそのカードまで移動して目立たせる
  const [deepLinkId, setDeepLinkId] = useState<string | null>(null);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("event");
    if (id) {
      setDeepLinkId(id);
      setView("list");
    }
  }, []);
  useEffect(() => {
    if (!deepLinkId || loading) return;
    const el = document.getElementById(`event-${deepLinkId}`);
    if (el) {
      el.scrollIntoView({ block: "center" });
      el.style.outline = "3px solid var(--color-accent)";
      window.setTimeout(() => (el.style.outline = ""), 2500);
    }
    setDeepLinkId(null);
    window.history.replaceState(null, "", "/events");
  }, [deepLinkId, loading, events]);

  function changeView(v: "list" | "calendar") {
    setView(v);
    try {
      localStorage.setItem("toloc_events_view", v);
    } catch {
      // noop
    }
  }

  async function handleCreate(input: EventCreateInput) {
    const created = await createEvent(input);
    applyLocalUpdate(created);
    toast.success(`「${created.title}」を作成しました`);
  }

  const sorted = [...events].sort((a, b) =>
    a.start_time.localeCompare(b.start_time)
  );

  return (
    <div>
      <ModulePageHeader
        title="イベント"
        actions={
          <>
            <CsvButton kind="events" />
            <button className="ios-btn" onClick={() => setModalOpen(true)}>
              追加
            </button>
          </>
        }
      />

      <Segmented<"list" | "calendar">
        className="mb-4 w-full max-w-xs"
        value={view}
        onChange={changeView}
        options={[
          { value: "list", label: "リスト" },
          { value: "calendar", label: "カレンダー" },
        ]}
      />

      {error && <p className="text-sm text-danger mb-3">{error}</p>}
      {loading ? (
        <p className="text-sm text-label-3">読み込み中...</p>
      ) : view === "calendar" ? (
        <EventCalendar
          events={sorted}
          renderEvent={(event) => (
            <EventCard key={event.id} event={event} onLocalUpdate={applyLocalUpdate} onLocalRemove={removeLocal} />
          )}
        />
      ) : loading ? (
        <p className="text-sm text-label-3">読み込み中...</p>
      ) : sorted.length === 0 ? (
        <button type="button" className="ios-btn-gray" onClick={() => setModalOpen(true)}>
          ＋ 最初のイベントを追加
        </button>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              onLocalUpdate={applyLocalUpdate}
              onLocalRemove={removeLocal}
            />
          ))}
        </div>
      )}

      <EventModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleCreate}
      />
    </div>
  );
}
