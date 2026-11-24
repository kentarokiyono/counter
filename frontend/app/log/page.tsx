"use client";

import { useCallback, useEffect, useState } from "react";
import ModulePageHeader from "@/components/ModulePageHeader";
import { Avatar } from "@/components/AccountSheet";
import { useMembers } from "@/hooks/useMembers";
import { ActivityEntry, ActivityFilter, KIND_LABELS, searchActivity } from "@/lib/homeApi";
import { subscribeLive } from "@/lib/live";
import { useIsAdmin } from "@/lib/self";

const PAGE = 50;

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "今日";
  if (d.toDateString() === y.toDateString()) return "昨日";
  return d.toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" });
}

export default function ActivityLogPage() {
  const isAdmin = useIsAdmin();
  if (!isAdmin) {
    return (
      <div>
        <ModulePageHeader title="最近の動き" />
        <p className="text-[15px]">管理者だけが見られます</p>
      </div>
    );
  }
  return <ActivityLog />;
}

function ActivityLog() {
  const { members } = useMembers();
  const [filter, setFilter] = useState<ActivityFilter>({});
  const [items, setItems] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async (f: ActivityFilter, append?: string) => {
    setLoading(true);
    try {
      const rows = await searchActivity({ ...f, before: append }, PAGE);
      setItems((prev) => (append ? [...prev, ...rows] : rows));
      setHasMore(rows.length === PAGE);
    } catch {
      if (!append) setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(filter);
  }, [filter, load]);

  // 絞り込みなしのときだけ、新しい記録を上に足す
  useEffect(() => {
    if (Object.values(filter).some(Boolean)) return;
    return subscribeLive("activity_log", (ev, row) => {
      if (ev === "INSERT") setItems((prev) => [row as unknown as ActivityEntry, ...prev]);
    });
  }, [filter]);

  const set = (k: keyof ActivityFilter, v: string) => setFilter((p) => ({ ...p, [k]: v || undefined }));
  const selectCls = "rounded-ios bg-card px-3 py-2.5 text-[15px] text-label outline-hidden";

  let lastDay = "";

  return (
    <div className="mx-auto max-w-3xl">
      <ModulePageHeader title="最近の動き" />

      <div className="mb-4 flex flex-wrap gap-2">
        <select className={selectCls} value={filter.actor ?? ""} onChange={(e) => set("actor", e.target.value)} aria-label="人">
          <option value="">全員</option>
          {members.map((m) => (
            <option key={m.id} value={m.name}>
              {m.name}
            </option>
          ))}
        </select>
        <select className={selectCls} value={filter.kind ?? ""} onChange={(e) => set("kind", e.target.value)} aria-label="種類">
          <option value="">すべての種類</option>
          {Object.entries(KIND_LABELS).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1.5">
          <input type="date" className={selectCls} value={filter.since ?? ""} onChange={(e) => set("since", e.target.value)} aria-label="開始日" />
          <span className="text-label-2">〜</span>
          <input type="date" className={selectCls} value={filter.until ?? ""} onChange={(e) => set("until", e.target.value)} aria-label="終了日" />
        </div>
        {Object.values(filter).some(Boolean) && (
          <button type="button" className="ios-btn-plain px-1" onClick={() => setFilter({})}>
            クリア
          </button>
        )}
      </div>

      {items.length === 0 && !loading ? (
        <p className="rounded-xl bg-card px-4 py-6 text-center text-[15px] text-label-2">該当する記録はありません</p>
      ) : (
        <div className="space-y-1">
          {items.map((a) => {
            const day = dayLabel(a.created_at);
            const header = day !== lastDay ? day : null;
            lastDay = day;
            return (
              <div key={a.id}>
                {header && <h2 className="px-4 pb-1.5 pt-4 text-[13px] font-semibold text-label-2">{header}</h2>}
                <div className="flex gap-3 rounded-xl bg-card px-4 py-3">
                  <Avatar name={a.actor} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] leading-snug">
                      <span className="font-semibold">{a.actor}</span> {a.summary}
                    </p>
                    <p className="mt-0.5 text-[12px] text-label-3">
                      {new Date(a.created_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                      {KIND_LABELS[a.kind] ? ` · ${KIND_LABELS[a.kind]}` : ""}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {hasMore && (
        <button
          type="button"
          className="ios-btn-gray mt-4 w-full"
          disabled={loading}
          onClick={() => load(filter, items[items.length - 1]?.created_at)}
        >
          {loading ? "読み込み中…" : "もっと見る"}
        </button>
      )}
    </div>
  );
}
