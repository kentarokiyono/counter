"use client";

import { useEffect, useState } from "react";
import Sheet from "@/components/ui/Sheet";
import Segmented from "@/components/ui/Segmented";
import { Group, Row } from "@/components/ui/Grouped";
import MembersSheet from "@/components/MembersSheet";
import { useMembers } from "@/hooks/useMembers";
import { API_BASE } from "@/lib/auth";
import Switch from "@/components/ui/Switch";
import { useToast } from "@/components/Toast";
import { PushState, disablePush, enablePush, getPushState, sendTestPush } from "@/lib/push";
import { IdleOption, getIdleLimit, setIdleLimit } from "@/lib/idleLogout";
import { useAuth } from "@/lib/self";
import { ThemePref, applyTheme, getThemePref } from "@/lib/theme";
import { listRequests } from "@/lib/membersApi";

/** メンバーのアイコン。Googleのプロフィール写真があれば写真、無ければ頭文字 */
export function Avatar({ name, size = 32, url }: { name: string; size?: number; url?: string | null }) {
  const { members } = useMembers();
  const [broken, setBroken] = useState(false);
  const src = url ?? members.find((m) => m.name === name)?.avatar_url ?? null;
  if (src && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="shrink-0 rounded-full bg-fill object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-linear-to-b from-[#a1a1aa] to-[#71717a] font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export default function AccountSheet({
  open,
  onClose,
  openMembers = false,
}: {
  open: boolean;
  onClose: () => void;
  /** 開いたらすぐメンバー管理を出す（参加リクエストの通知から来たとき） */
  openMembers?: boolean;
}) {
  const { me, signOut, authDisabled } = useAuth();
  const [theme, setTheme] = useState<ThemePref>("system");
  const [membersOpen, setMembersOpen] = useState(false);
  const [push, setPush] = useState<PushState | null>(null);
  const [status, setStatus] = useState<{ supabase: boolean; discord: boolean } | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [idle, setIdle] = useState<IdleOption>("0");
  const [requestCount, setRequestCount] = useState(0);
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    setTheme(getThemePref());
    if (openMembers) setMembersOpen(true);
    if (me.role === "admin") listRequests().then((r) => setRequestCount(r.length)).catch(() => setRequestCount(0));
    setIdle(getIdleLimit());
    getPushState().then(setPush).catch(() => setPush(null));
    setStatus(null);
    fetch(`${API_BASE}/api/health`)
      .then((r) => r.json())
      .then((h) => setStatus({ supabase: !!h?.supabase_connected, discord: !!h?.discord_configured }))
      .catch(() => setStatus({ supabase: false, discord: false }));
  }, [open]);

  async function togglePush(on: boolean) {
    setPushBusy(true);
    try {
      if (on) {
        await enablePush();
        toast.success("この端末で通知を受け取ります");
      } else {
        await disablePush();
      }
      setPush(await getPushState());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "設定できませんでした");
    } finally {
      setPushBusy(false);
    }
  }


  return (
    <>
      <Sheet
        open={open && !membersOpen}
        onClose={onClose}
        title="アカウント"
        trailing={
          <button type="button" className="ios-btn-plain font-semibold" onClick={onClose}>
            完了
          </button>
        }
      >
        <Group>
          <Row leading={<Avatar name={me.name} size={44} url={me.avatar_url} />}>
            <div className="text-[17px] font-semibold">{me.name}</div>
            <div className="truncate text-[13px] text-label-2">
              {me.email}
              {me.role === "admin" && " · 管理者"}
            </div>
          </Row>
        </Group>
        {authDisabled && (
          <p className="-mt-4 mb-6 px-4 text-[13px] text-warning">開発モード（認証オフ）で動作中です</p>
        )}

        <Group title="表示">
          <Row>
            <div className="flex items-center justify-between gap-3">
              <span>テーマ</span>
              <Segmented<ThemePref>
                size="sm"
                value={theme}
                onChange={(v) => {
                  setTheme(v);
                  applyTheme(v);
                }}
                options={[
                  { value: "light", label: "ライト" },
                  { value: "dark", label: "ダーク" },
                  { value: "system", label: "自動" },
                ]}
              />
            </div>
          </Row>
        </Group>

        {(push?.kind === "on" || push?.kind === "off" || push?.kind === "denied") && (
        <Group title="通知">
          <Row
            detail={
              <Switch
                checked={push?.kind === "on"}
                disabled={pushBusy || !push || (push.kind !== "on" && push.kind !== "off")}
                onChange={togglePush}
                label="この端末で通知を受け取る"
              />
            }
          >
            {push?.kind === "denied" ? "通知は端末の設定でオフになっています" : "この端末で通知を受け取る"}
          </Row>
          {push?.kind === "on" && (
            <Row
              onClick={() =>
                sendTestPush()
                  .then((r) => (r.sent ? toast.success("テスト通知を送りました") : toast.error("送れませんでした")))
                  .catch(() => toast.error("送れませんでした"))
              }
            >
              <span className="text-accent">テスト通知を送る</span>
            </Row>
          )}
        </Group>
        )}

        {!authDisabled && (
          <Group title="自動ログアウト（この端末）">
            <Row>
              <Segmented<IdleOption>
                size="sm"
                value={idle}
                onChange={(v) => {
                  setIdleLimit(v);
                  setIdle(v);
                }}
                options={[
                  { value: "0", label: "しない" },
                  { value: "30", label: "30分" },
                  { value: "120", label: "2時間" },
                  { value: "480", label: "8時間" },
                ]}
              />
            </Row>
          </Group>
        )}

        <Group>
          <Row
            onClick={() => setMembersOpen(true)}
            chevron
            detail={
              requestCount > 0 ? (
                <span className="rounded-full bg-danger px-2 py-0.5 text-[12px] font-semibold text-white">参加リクエスト {requestCount}</span>
              ) : undefined
            }
          >
            メンバー管理
          </Row>
        </Group>

        <Group title="接続状態">
          {(
            [
              ["supabase", "データベース（Supabase）"],
              ["discord", "Discord 通知"],
            ] as const
          ).map(([key, label]) => (
            <Row
              key={key}
              detail={
                status === null ? (
                  "確認中…"
                ) : (
                  <span className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${status[key] ? "bg-success" : "bg-danger"}`} />
                    {status[key] ? "接続OK" : "未接続"}
                  </span>
                )
              }
            >
              {label}
            </Row>
          ))}
        </Group>

        <Group>
          <Row
            destructive
            onClick={async () => {
              onClose();
              await signOut();
            }}
          >
            ログアウト
          </Row>
        </Group>
      </Sheet>
      <MembersSheet open={membersOpen} onClose={() => setMembersOpen(false)} />
    </>
  );
}
