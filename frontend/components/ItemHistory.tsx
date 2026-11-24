"use client";

import { useState } from "react";
import { getJson } from "@/lib/http";
import { relativeTime } from "@/lib/homeApi";
import { useIsAdmin } from "@/lib/self";

interface Change {
  label: string;
  from: string;
  to: string;
}

interface Entry {
  id: string;
  created_at: string;
  actor: string;
  action: string;
  summary: string;
  meta: { changes?: Change[] };
}

/** イベントの変更履歴（管理者のみ。開いたときに読み込む） */
export default function ItemHistory({ kind, id }: { kind: "events"; id: string }) {
  const isAdmin = useIsAdmin();
  const [items, setItems] = useState<Entry[] | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);
  if (!isAdmin) return null;

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      setError(false);
      getJson<Entry[]>(`/api/history/${kind}/${id}`)
        .then(setItems)
        .catch(() => setError(true));
    }
  }

  return (
    <div className="px-4 py-2">
      <button type="button" className="ios-btn-plain text-[15px]" onClick={toggle} aria-expanded={open}>
        {open ? "変更履歴を閉じる" : "変更履歴"}
      </button>
      {open && (
        <ul className="mt-2 space-y-2">
          {error ? (
            <li className="text-[13px] text-danger">読み込めませんでした</li>
          ) : items === null ? (
            <li className="text-[13px] text-label-3">読み込み中...</li>
          ) : items.length === 0 ? (
            <li className="text-[13px] text-label-2">記録はありません</li>
          ) : (
            items.map((e) => (
              <li key={e.id} className="rounded-xl bg-fill px-3 py-2 text-[13px]">
                <div className="text-label-2">
                  {e.actor} · {relativeTime(e.created_at)}
                </div>
                {e.meta?.changes?.length ? (
                  <ul className="mt-0.5 space-y-0.5">
                    {e.meta.changes.map((c) => (
                      <li key={c.label}>
                        <span className="font-semibold">{c.label}</span>: {c.from} → {c.to}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-0.5">{e.summary}</div>
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
