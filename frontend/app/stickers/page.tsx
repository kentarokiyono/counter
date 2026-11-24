"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ModulePageHeader from "@/components/ModulePageHeader";
import Sheet from "@/components/ui/Sheet";
import { Field, Group, Row } from "@/components/ui/Grouped";
import { useToast } from "@/components/Toast";
import ColorEditor, { Swatch } from "@/components/stickers/ColorEditor";
import { useEvents } from "@/hooks/useEvents";
import { applyLive, subscribeLive } from "@/lib/live";
import { DEFAULT_COLORS, StickerColor, Survey, createSurvey, listSurveys } from "@/lib/stickersApi";

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function NewSurveySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { events } = useEvents();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today());
  const [location, setLocation] = useState("");
  const [eventId, setEventId] = useState("");
  const [colors, setColors] = useState<StickerColor[]>(DEFAULT_COLORS);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setDate(today());
    setLocation("");
    setEventId("");
    setColors(DEFAULT_COLORS);
  }, [open]);

  // イベントを選んだら、名前・日付・場所を埋める（空のときだけ）
  function pickEvent(id: string) {
    setEventId(id);
    const ev = events.find((e) => e.id === id);
    if (!ev) return;
    if (!title.trim()) setTitle(`${ev.title} 来場者調査`);
    const d = new Date(ev.start_time);
    setDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    if (!location.trim() && ev.location) setLocation(ev.location);
  }

  const colorsOk = colors.length > 0 && colors.every((c) => c.label.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !colorsOk) return;
    setBusy(true);
    try {
      const s = await createSurvey({
        title: title.trim(),
        survey_date: date || undefined,
        location: location.trim() || undefined,
        event_id: eventId || undefined,
        colors: colors.map((c) => ({ ...c, label: c.label.trim() })),
      });
      onClose();
      router.push(`/stickers/${s.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "作成できませんでした");
    } finally {
      setBusy(false);
    }
  }

  const upcoming = events
    .filter((e) => e.status !== "cancelled")
    .sort((a, b) => b.start_time.localeCompare(a.start_time))
    .slice(0, 30);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="新しいシール集計"
      leading={
        <button type="button" className="ios-btn-plain" onClick={onClose}>
          キャンセル
        </button>
      }
      trailing={
        <button type="submit" form="new-survey" className="ios-btn-plain font-semibold" disabled={busy || !title.trim() || !colorsOk}>
          作成
        </button>
      }
    >
      <form id="new-survey" onSubmit={submit} className="space-y-4">
        {upcoming.length > 0 && (
          <Field label="イベント">
            <select className="ios-input bg-card" value={eventId} onChange={(e) => pickEvent(e.target.value)}>
              <option value="">（なし）</option>
              {upcoming.map((e) => (
                <option key={e.id} value={e.id}>
                  {new Date(e.start_time).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })} {e.title}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="名前" required>
          <input
            className="ios-input bg-card"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例: 道の駅なみえ 来場者調査"
            maxLength={200}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="日付">
            <input type="date" className="ios-input bg-card" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="場所">
            <input className="ios-input bg-card" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="例: 浪江町" />
          </Field>
        </div>
        <Field label="色と意味" group>
          <ColorEditor value={colors} onChange={setColors} />
        </Field>
      </form>
    </Sheet>
  );
}

export default function StickersPage() {
  const [surveys, setSurveys] = useState<Survey[] | null>(null);
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const reloadTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new") === "1") {
      setOpen(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    const load = () =>
      listSurveys()
        .then(setSurveys)
        .catch((err) => {
          toast.error(err instanceof Error ? err.message : "読み込めませんでした");
          setSurveys([]);
        });
    load();
    // 合計は数が変わるたびに変わるので、少しまとめて読み直す
    const later = () => {
      window.clearTimeout(reloadTimer.current);
      reloadTimer.current = window.setTimeout(load, 1500);
    };
    const off1 = subscribeLive(
      "sticker_surveys",
      (ev, row) => setSurveys((p) => (p ? applyLive(p, ev, { total: p.find((s) => s.id === row.id)?.total ?? 0, ...row }) : p)),
      load
    );
    const off2 = subscribeLive("sticker_counts", later);
    return () => {
      window.clearTimeout(reloadTimer.current);
      off1();
      off2();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = (surveys ?? []).filter((s) => s.status === "active");
  const done = (surveys ?? []).filter((s) => s.status === "done");
  const row = (s: Survey) => (
    <Row
      key={s.id}
      href={`/stickers/${s.id}`}
      detail={<span className="tabular-nums font-semibold text-label">{(s.total ?? 0).toLocaleString()}枚</span>}
    >
      <div className="flex items-center gap-2">
        <span className="flex shrink-0 -space-x-1">
          {s.colors.map((c) => (
            <span key={c.key} className="rounded-full ring-2 ring-card">
              <Swatch color={c.key} size={12} />
            </span>
          ))}
        </span>
        <span className="truncate font-medium">{s.title}</span>
      </div>
      <div className="truncate text-[13px] text-label-2">{[s.survey_date, s.location].filter(Boolean).join(" · ") || "—"}</div>
    </Row>
  );

  return (
    <div className="mx-auto max-w-3xl">
      <ModulePageHeader
        title="シール集計"
        actions={
          <button type="button" className="ios-btn" onClick={() => setOpen(true)}>
            新しい集計
          </button>
        }
      />
      {surveys === null ? (
        <p className="text-[15px] text-label-3">読み込み中...</p>
      ) : surveys.length === 0 ? (
        <button type="button" className="ios-btn-gray" onClick={() => setOpen(true)}>
          ＋ 最初の集計を作成
        </button>
      ) : (
        <>
          {active.length > 0 && <Group title="集計中">{active.map(row)}</Group>}
          {done.length > 0 && <Group title="終了">{done.map(row)}</Group>}
        </>
      )}
      <NewSurveySheet open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
