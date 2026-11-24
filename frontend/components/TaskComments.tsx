"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/AccountSheet";
import { useToast } from "@/components/Toast";
import { getJson, sendJson } from "@/lib/http";
import { relativeTime } from "@/lib/homeApi";
import { subscribeLive } from "@/lib/live";
import { useAuth } from "@/lib/self";
import { useMembers } from "@/hooks/useMembers";

interface Comment {
  id: string;
  task_id: string;
  author: string;
  body: string;
  created_at: string;
}

/** 本文の @名前 を強調して表示する（登録メンバーの名前だけ） */
function CommentBody({ body, names }: { body: string; names: string[] }) {
  const sorted = [...names].filter(Boolean).sort((a, b) => b.length - a.length);
  if (sorted.length === 0) return <>{body}</>;
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = body.split(new RegExp(`(@(?:${sorted.map(esc).join("|")}))`, "g"));
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <span key={i} className="rounded-sm bg-accent-soft px-0.5 font-semibold text-accent-ink">
            {p}
          </span>
        ) : (
          p
        )
      )}
    </>
  );
}

/** タスクのコメント欄（担当者と、@名前 を付けた人に通知される） */
export default function TaskComments({ taskId }: { taskId: string }) {
  const { me } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const { members } = useMembers();
  const names = members.map((m) => m.name);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [cursor, setCursor] = useState(0);
  // 入力中の「@...」に合う候補
  const query = /@([^\s@]*)$/.exec(text.slice(0, cursor))?.[1];
  const suggestions =
    query === undefined
      ? []
      : names.filter((n) => n !== me.name && n.toLowerCase().startsWith(query.toLowerCase())).slice(0, 6);

  function pick(name: string) {
    const before = text.slice(0, cursor).replace(/@[^\s@]*$/, `@${name} `);
    const next = before + text.slice(cursor);
    setText(next);
    setCursor(before.length);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(before.length, before.length);
    });
  }

  useEffect(() => {
    const load = () => getJson<Comment[]>(`/api/tasks/${taskId}/comments`).then(setItems).catch(() => {});
    load();
    return subscribeLive(
      "task_comments",
      (ev, row) => {
        if (row.task_id !== taskId) return;
        if (ev === "DELETE") setItems((p) => p.filter((c) => c.id !== row.id));
        else setItems((p) => (p.some((c) => c.id === row.id) ? p : [...p, row as unknown as Comment]));
      },
      load
    );
  }, [taskId]);

  // タスク編集フォームの中に置くので <form> は使わない（入れ子にすると外側のフォームが送信される）
  async function send() {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const c = await sendJson<Comment>("POST", `/api/tasks/${taskId}/comments`, { body: text.trim() });
      setItems((p) => (p.some((x) => x.id === c.id) ? p : [...p, c]));
      setText("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "送れませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <span className="mb-1 block px-1 text-[13px] text-label-2">コメント（{items.length}）</span>
      <div className="space-y-2.5 rounded-xl bg-card p-3">
        {items.length === 0 && <p className="text-[13px] text-label-3">まだコメントはありません</p>}
        {items.map((c) => (
          <div key={c.id} className="flex gap-2">
            <Avatar name={c.author} size={26} />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-label-2">
                <span className="font-semibold text-label">{c.author}</span> · {relativeTime(c.created_at)}
                {(c.author === me.name || me.role === "admin") && (
                  <button
                    type="button"
                    className="ml-2 text-danger"
                    onClick={() =>
                      sendJson("DELETE", `/api/task-comments/${c.id}`)
                        .then(() => setItems((p) => p.filter((x) => x.id !== c.id)))
                        .catch(() => toast.error("削除できませんでした"))
                    }
                  >
                    削除
                  </button>
                )}
              </p>
              <p className="whitespace-pre-wrap wrap-break-word text-[15px]">
                <CommentBody body={c.body} names={names} />
              </p>
            </div>
          </div>
        ))}
        {suggestions.length > 0 && (
          <div role="listbox" aria-label="メンションの候補" className="flex flex-wrap gap-1.5 border-t border-separator pt-2">
            {suggestions.map((n) => (
              <button
                key={n}
                type="button"
                role="option"
                aria-selected={false}
                className="rounded-full bg-accent-soft px-2.5 py-1 text-[13px] font-medium text-accent-ink"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(n)}
              >
                @{n}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2 border-t border-separator pt-2.5">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setCursor(e.target.selectionStart ?? e.target.value.length);
            }}
            onSelect={(e) => setCursor(e.currentTarget.selectionStart ?? 0)}
            rows={1}
            placeholder="コメント（@名前で通知）"
            className="min-h-[36px] flex-1 resize-none rounded-lg bg-fill px-3 py-2 text-[15px] outline-hidden placeholder:text-label-3"
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button type="button" onClick={send} disabled={busy || !text.trim()} className="ios-btn px-3 py-2 text-[14px]">
            送信
          </button>
        </div>
      </div>
    </div>
  );
}
