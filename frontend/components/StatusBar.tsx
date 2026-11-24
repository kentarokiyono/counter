"use client";

import Link from "next/link";
import { Avatar } from "@/components/AccountSheet";
import { useAuth } from "@/lib/self";

/** 上部バー（すりガラス）。左: アプリ名（スマホ） / 右: アカウント */
export default function StatusBar({ onOpenAccount }: { onOpenAccount: () => void }) {
  const { me } = useAuth();
  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between gap-3 border-b border-separator bg-bar px-4 backdrop-blur-xl md:h-14 md:justify-end md:px-6">
      <Link href="/" className="flex items-center gap-2 md:hidden">
        <img src="/toloc-logo.png" alt="" className="h-7 w-7" />
        <span className="text-[15px] font-bold text-label">Toloc OS</span>
      </Link>
      <button
        type="button"
        onClick={onOpenAccount}
        className="flex items-center gap-2 rounded-full p-0.5 md:pr-3 md:hover:bg-fill"
        aria-label="アカウント"
      >
        <Avatar name={me.name} size={30} url={me.avatar_url} />
        <span className="hidden text-[14px] font-medium text-label md:inline">{me.name}</span>
      </button>
    </header>
  );
}
