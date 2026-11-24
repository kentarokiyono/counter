"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import NavIcon from "@/components/NavIcon";
import TeamLogo from "@/components/TeamLogo";
import { MORE_ITEMS, NavItem, OPS_ITEMS, activeHref, visibleFor } from "@/lib/nav";
import { useIsAdmin } from "@/lib/self";

/** md 以上で表示する左サイドバー */
export default function Sidebar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const isAdmin = useIsAdmin();
  const current = activeHref(usePathname());

  function renderItem(item: NavItem, small = false) {
    const active = current === item.href;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-2.5 rounded-ios px-2.5 transition-colors ${
          small ? "py-[5px] text-[14px]" : "py-[8px] text-[16px]"
        } ${active ? "bg-accent-soft text-accent-ink" : small ? "text-label-2 hover:bg-fill" : "text-label hover:bg-fill"}`}
      >
        <NavIcon
          name={item.href}
          className={`${small ? "h-4 w-4" : "h-[19px] w-[19px]"} ${active ? "" : small ? "text-label-2" : "text-accent"}`}
        />
        {item.label}
      </Link>
    );
  }

  return (
    <aside
      className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col overflow-y-auto border-r border-separator bg-sidebar md:flex"
      aria-label="メインメニュー"
    >
      <Link href="/" className="block px-4 pb-4 pt-5">
        <TeamLogo />
      </Link>

      <div className="px-3">
        <button
          type="button"
          onClick={onOpenPalette}
          className="flex w-full items-center gap-2 rounded-ios bg-fill px-2.5 py-[7px] text-left text-[15px] text-label-2"
        >
          <NavIcon name="search" className="h-4 w-4" />
          <span className="flex-1">検索</span>
          <kbd className="text-[11px] text-label-3">⌘K</kbd>
        </button>
      </div>

      <nav className="space-y-0.5 px-3 pt-4">{OPS_ITEMS.map((i) => renderItem(i))}</nav>

      <nav className="mx-3 mt-3 space-y-0.5 border-t border-separator pt-3">
        {visibleFor(MORE_ITEMS, isAdmin).map((i) => renderItem(i, true))}
      </nav>
    </aside>
  );
}
