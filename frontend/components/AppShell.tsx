"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import StatusBar from "@/components/StatusBar";
import TabBar from "@/components/TabBar";
import CommandPalette from "@/components/CommandPalette";
import AccountSheet from "@/components/AccountSheet";
import Welcome from "@/components/Welcome";
import Sheet from "@/components/ui/Sheet";
import { Group, Row } from "@/components/ui/Grouped";
import NavIcon from "@/components/NavIcon";
import { ToastProvider } from "@/components/Toast";
import { sendPing } from "@/lib/activityApi";
import { API_BASE } from "@/lib/auth";
import { MORE_ITEMS, OPS_ITEMS, TAB_HREFS, visibleFor } from "@/lib/nav";
import { useAuth, useIsAdmin } from "@/lib/self";
import { useIdleLogout } from "@/lib/idleLogout";

const PING_INTERVAL_MS = 60_000;

/** 在席ハートビート（タブ表示中のみ） */
function usePresencePing() {
  useEffect(() => {
    const ping = () => {
      if (!document.hidden) sendPing().catch(() => {});
    };
    ping();
    const timer = setInterval(ping, PING_INTERVAL_MS);
    document.addEventListener("visibilitychange", ping);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", ping);
    };
  }, []);
}

function MoreSheet({ open, onClose, onSearch }: { open: boolean; onClose: () => void; onSearch: () => void }) {
  const isAdmin = useIsAdmin();
  const rest = OPS_ITEMS.filter((i) => !TAB_HREFS.includes(i.href));
  const icon = (name: string) => (
    <span className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-accent-soft text-accent-ink">
      <NavIcon name={name} className="h-4 w-4" />
    </span>
  );
  return (
    <Sheet open={open} onClose={onClose} title="その他">
      <Group>
        {rest.map((i) => (
          <Row key={i.href} href={i.href} leading={icon(i.href)}>
            {i.label}
          </Row>
        ))}
      </Group>
      <Group>
        <Row
          onClick={() => {
            onClose();
            onSearch();
          }}
          leading={icon("search")}
          chevron
        >
          検索
        </Row>
        {visibleFor(MORE_ITEMS, isAdmin).map((i) => (
          <Row key={i.href} href={i.href} leading={icon(i.href)}>
            {i.label}
          </Row>
        ))}
      </Group>
    </Sheet>
  );
}

/** ホーム画面に追加して使えるよう Service Worker を登録し、通信状態を返す */
function usePwa(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register(`/sw.js?api=${encodeURIComponent(API_BASE)}`).catch(() => {});
    }
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const online = usePwa();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  // 参加リクエストの通知（/?members=1）から来たら、メンバー管理を開く
  const [openMembers, setOpenMembers] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("members") === "1") {
      setOpenMembers(true);
      setAccountOpen(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);
  const pathname = usePathname();
  usePresencePing();
  useIdleLogout(useAuth().signOut);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <ToastProvider>
      <div className="flex min-h-screen bg-grouped">
        <Sidebar onOpenPalette={() => setPaletteOpen(true)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <StatusBar onOpenAccount={() => setAccountOpen(true)} />
          {!online && (
            <div className="bg-p-orange px-4 py-1.5 text-center text-[13px] font-semibold text-p-orange-ink">
              オフラインです。前回読み込んだ内容を表示しています（変更は保存できません）
            </div>
          )}
          {/* スマホは下部タブバーの分だけ余白を空ける */}
          <main className="flex-1 overflow-x-clip px-4 pb-28 pt-4 text-label md:px-8 md:pb-10 md:pt-8">
            {children}
          </main>
        </div>
      </div>
      <TabBar onMore={() => setMoreOpen(true)} moreActive={moreOpen} />
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} onSearch={() => setPaletteOpen(true)} />
      <AccountSheet
        open={accountOpen}
        openMembers={openMembers}
        onClose={() => {
          setAccountOpen(false);
          setOpenMembers(false);
        }}
      />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <Welcome />
    </ToastProvider>
  );
}
