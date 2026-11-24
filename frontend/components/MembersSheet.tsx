"use client";

import { useCallback, useEffect, useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { Group, Row } from "@/components/ui/Grouped";
import { useToast } from "@/components/Toast";
import { useMembers } from "@/hooks/useMembers";
import { MEMBER_EMAIL_DOMAIN } from "@/lib/auth";
import {
  HandoverPreview,
  Member,
  MemberRequest,
  addMember,
  approveRequest,
  deleteMember,
  getHandover,
  handover,
  listRequests,
  rejectRequest,
  updateMember,
} from "@/lib/membersApi";
import { subscribeLive } from "@/lib/live";
import { useAuth } from "@/lib/self";

/** メンバー管理: 新しいメンバーは管理者の許可制（管理者以外の追加は申請になる）。削除・権限変更・メール変更は管理者のみ */
export default function MembersSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me } = useAuth();
  const { members } = useMembers();
  const toast = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [editEmail, setEditEmail] = useState("");
  // 削除前の引き継ぎ（未完了の担当があるとき）
  const [pending, setPending] = useState<HandoverPreview | null>(null);
  const [successor, setSuccessor] = useState("");
  const isAdmin = me.role === "admin";
  const [requests, setRequests] = useState<MemberRequest[]>([]);

  const loadRequests = useCallback(() => {
    if (isAdmin) listRequests().then(setRequests).catch(() => {});
  }, [isAdmin]);

  useEffect(() => {
    if (!open || !isAdmin) return;
    loadRequests();
    return subscribeLive("member_requests", loadRequests, loadRequests);
  }, [open, isAdmin, loadRequests]);

  async function decide(r: MemberRequest, ok: boolean) {
    if (!ok && !confirm(`${r.name}さんの申請を見送りますか？`)) return;
    setBusy(true);
    try {
      if (ok) {
        await approveRequest(r.id);
        toast.success(`${r.name}さんをメンバーにしました`);
      } else {
        await rejectRequest(r.id);
        toast.success("見送りました");
      }
      setRequests((p) => p.filter((x) => x.id !== r.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "処理できませんでした");
    } finally {
      setBusy(false);
    }
  }

  function fullEmail(v: string): string {
    const t = v.trim();
    return t.includes("@") ? t : `${t}@${MEMBER_EMAIL_DOMAIN}`;
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setBusy(true);
    try {
      const added = await addMember(name.trim(), fullEmail(email));
      toast.success(added.requested ? `${name.trim()}さんの参加を申請しました（管理者の許可待ち）` : `${name.trim()}さんを追加しました`);
      setName("");
      setEmail("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "追加に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function startDelete(m: Member) {
    setBusy(true);
    try {
      const pre = await getHandover(m.id);
      const total = pre.tasks.length + pre.events.length;
      if (total === 0) {
        if (confirm(`${m.name}さんを削除しますか？`)) await run(() => deleteMember(m.id), `${m.name}さんを削除しました`);
        return;
      }
      setSuccessor("");
      setPending(pre);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "担当の確認に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function handoverAndDelete(m: Member) {
    const to = successor || null;
    if (!confirm(`${m.name}さんの担当を${to ? `${to}さん` : "未割当"}に移して、${m.name}さんを削除しますか？`)) return;
    await run(async () => {
      await handover(m.id, to);
      await deleteMember(m.id);
      setPending(null);
    }, `引き継いで、${m.name}さんを削除しました`);
  }

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(done);
      setEditing(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Sheet
        open={open && !editing}
        onClose={onClose}
        title="メンバー管理"
        trailing={
          <button type="button" className="ios-btn-plain font-semibold" onClick={onClose}>
            完了
          </button>
        }
      >
        {isAdmin && requests.length > 0 && (
          <Group title={`参加リクエスト（${requests.length}）`}>
            {requests.map((r) => (
              <Row
                key={r.id}
                detail={
                  <div className="flex items-center gap-3">
                    <button type="button" className="text-[15px] text-danger" disabled={busy} onClick={() => decide(r, false)}>
                      見送る
                    </button>
                    <button type="button" className="ios-btn px-3 py-1.5 text-[14px]" disabled={busy} onClick={() => decide(r, true)}>
                      許可
                    </button>
                  </div>
                }
              >
                <div className="truncate font-medium">{r.name}</div>
                <div className="truncate text-[13px] text-label-2">
                  {[r.email, r.note, r.requested_by && `${r.requested_by}さんから`].filter(Boolean).join(" · ")}
                </div>
              </Row>
            ))}
          </Group>
        )}

        <form onSubmit={handleAdd}>
          <Group title={isAdmin ? "メンバーを追加" : "メンバーを追加（管理者の許可が必要）"}>
            <div className="px-4 py-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="名前"
                maxLength={50}
                className="w-full bg-transparent py-1.5 text-[15px] outline-hidden placeholder:text-label-3"
              />
            </div>
            <div className="flex items-center px-4 py-2">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="メールアドレス"
                inputMode="email"
                autoCapitalize="off"
                className="min-w-0 flex-1 bg-transparent py-1.5 text-[15px] outline-hidden placeholder:text-label-3"
              />
              {!email.includes("@") && <span className="text-[15px] text-label-3">@{MEMBER_EMAIL_DOMAIN}</span>}
            </div>
            <div className="px-4 py-2.5">
              <button
                type="submit"
                disabled={busy || !name.trim() || !email.trim()}
                className="ios-btn-plain font-semibold"
              >
                {isAdmin ? "追加" : "申請"}
              </button>
            </div>
          </Group>
        </form>

        <Group
          title={`メンバー（${members.length}）`}
        >
          {members.map((m) => (
            <Row
              key={m.id}
              onClick={
                isAdmin
                  ? () => {
                      setEditing(m);
                      setPending(null);
                      setEditEmail(m.email ?? "");
                    }
                  : undefined
              }
              chevron={isAdmin}
              detail={m.role === "admin" ? "管理者" : undefined}
            >
              <div>{m.name}</div>
              <div className="truncate text-[13px] text-label-2">
                {m.email ?? "メール未登録（ログイン不可）"}
              </div>
            </Row>
          ))}
        </Group>
      </Sheet>

      {editing && (
        <Sheet
          open
          onClose={() => setEditing(null)}
          title={editing.name}
          leading={
            <button type="button" className="ios-btn-plain" onClick={() => setEditing(null)}>
              戻る
            </button>
          }
          locked={busy}
        >
          <Group title="メールアドレス">
            <div className="flex items-center gap-2 px-4 py-2">
              <input
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder={`xxx@${MEMBER_EMAIL_DOMAIN}`}
                inputMode="email"
                autoCapitalize="off"
                className="min-w-0 flex-1 bg-transparent py-1.5 text-[15px] outline-hidden placeholder:text-label-3"
              />
              <button
                type="button"
                disabled={busy || !editEmail.trim() || editEmail.trim() === editing.email}
                onClick={() =>
                  run(() => updateMember(editing.id, { email: fullEmail(editEmail) }), "メールを更新しました")
                }
                className="ios-btn-plain font-semibold"
              >
                保存
              </button>
            </div>
          </Group>
          <Group>
            {editing.role === "admin" ? (
              <Row
                onClick={
                  editing.id === me.id
                    ? undefined
                    : () => run(() => updateMember(editing.id, { role: "member" }), "管理者権限を外しました")
                }
              >
                <span className={editing.id === me.id ? "text-label-3" : "text-accent"}>
                  管理者権限を外す{editing.id === me.id ? "（自分は不可）" : ""}
                </span>
              </Row>
            ) : (
              <Row onClick={() => run(() => updateMember(editing.id, { role: "admin" }), "管理者にしました")}>
                <span className="text-accent">管理者にする</span>
              </Row>
            )}
          </Group>
          {editing.id !== me.id && pending?.name === editing.name && (
            <Group title="未完了の担当を引き継ぐ">
              {(
                [
                  ["タスク", pending.tasks],
                  ["イベント", pending.events],
                ] as const
              )
                .filter(([, list]) => list.length > 0)
                .map(([label, list]) => (
                  <Row key={label}>
                    <div className="text-[13px] font-semibold text-label-2">
                      {label}（{list.length}件）
                    </div>
                    <div className="truncate text-[15px]">{list.map((x) => x.title).join("、")}</div>
                  </Row>
                ))}
              <Row>
                <label className="flex items-center justify-between gap-3">
                  <span>引き継ぐ人</span>
                  <select
                    aria-label="引き継ぐ人"
                    className="ios-input w-auto bg-card"
                    value={successor}
                    onChange={(e) => setSuccessor(e.target.value)}
                  >
                    <option value="">未割当にする</option>
                    {members
                      .filter((m) => m.id !== editing.id)
                      .map((m) => (
                        <option key={m.id} value={m.name}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                </label>
              </Row>
              <Row destructive onClick={busy ? undefined : () => handoverAndDelete(editing)}>
                引き継いで削除
              </Row>
            </Group>
          )}
          {editing.id !== me.id && pending?.name !== editing.name && (
            <Group>
              <Row destructive onClick={busy ? undefined : () => startDelete(editing)}>
                メンバーから削除
              </Row>
            </Group>
          )}
        </Sheet>
      )}
    </>
  );
}
