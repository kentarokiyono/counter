"use client";

import { useCallback, useEffect, useState } from "react";
import { getJson, sendJson } from "@/lib/http";

type JoinStatus = { status: "none" | "pending" | "approved" | "rejected" | "member"; email: string; name?: string; name_hint?: string };

/**
 * まだメンバーでない大学アカウントの人の画面: 参加を申請し、管理者の許可を待つ。
 * 許可されたら onApproved（ログイン状態の確認し直し）を呼ぶ。
 */
export default function JoinRequest({ onApproved, onSignOut }: { onApproved: () => void; onSignOut: () => void }) {
  const [info, setInfo] = useState<JoinStatus | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await getJson<JoinStatus>("/api/join");
      setInfo(r);
      if (r.status === "member") onApproved();
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : "確認できませんでした");
      return null;
    }
  }, [onApproved]);

  useEffect(() => {
    refresh().then((r) => r && setName((r.name ?? r.name_hint ?? "").trim()));
  }, [refresh]);

  // 申請中は、許可されたら自動で入れるよう定期的に確認する
  useEffect(() => {
    if (info?.status !== "pending") return;
    const t = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(t);
  }, [info?.status, refresh]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await sendJson("POST", "/api/join", { name: name.trim(), note: note.trim() || undefined });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "申請できませんでした");
    } finally {
      setBusy(false);
    }
  }

  if (!info) return <p className="mt-5 text-sm text-label-3">{error ?? "確認中..."}</p>;

  const signOutButton = (
    <button type="button" onClick={onSignOut} className="ios-btn-plain mt-3 text-[15px]">
      別のアカウントでログイン
    </button>
  );

  if (info.status === "pending")
    return (
      <div className="mt-5 text-left">
        <p className="rounded-xl bg-p-blue px-3 py-2.5 text-sm text-p-blue-ink">
          {info.name}さんの参加を申請しました。管理者が許可すると使えるようになります。
        </p>
        <button type="button" onClick={refresh} className="mt-4 w-full rounded-xl bg-accent-soft px-4 py-3 text-[15px] font-semibold text-accent-ink">
          許可されたか確認する
        </button>
        <div className="text-center">{signOutButton}</div>
      </div>
    );

  return (
    <form onSubmit={submit} className="mt-5 space-y-3 text-left">
      <p className="text-sm text-label">
        {info.status === "rejected" ? "前回の申請は見送られました。必要なら申請し直してください。" : "このアカウントはまだメンバーではありません。参加を申請してください。"}
      </p>
      <p className="truncate text-[13px] text-label-2">{info.email}</p>
      <input
        className="ios-input bg-fill"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="名前（チーム内で呼ばれている名前）"
        aria-label="名前"
        maxLength={50}
      />
      <input
        className="ios-input bg-fill"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="学年・所属・ひとこと（任意）"
        aria-label="ひとこと"
        maxLength={300}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <button type="submit" disabled={busy || !name.trim()} className="w-full rounded-xl bg-accent-soft px-4 py-3 text-[15px] font-semibold text-accent-ink disabled:opacity-50">
        参加を申請する
      </button>
      <div className="text-center">{signOutButton}</div>
    </form>
  );
}
