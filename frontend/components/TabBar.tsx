"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import NavIcon from "@/components/NavIcon";
import { OPS_ITEMS, TAB_HREFS, activeHref } from "@/lib/nav";

/** スマホ用の下部タブバー（iOS 風）。タブに無い画面は「その他」から開く */
export default function TabBar({ onMore, moreActive }: { onMore: () => void; moreActive: boolean }) {
  const pathname = activeHref(usePathname());
  const tabs = TAB_HREFS.map((h) => OPS_ITEMS.find((i) => i.href === h)!).filter(Boolean);
  const inTabs = TAB_HREFS.includes(pathname);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-separator bg-bar backdrop-blur-xl pb-safe md:hidden"
      aria-label="タブ"
    >
      <div className="grid grid-cols-5">
        {tabs.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 pb-1 pt-1.5 text-[10px] font-medium ${
                active ? "text-accent" : "text-label-2"
              }`}
            >
              <NavIcon name={t.href} className="h-6 w-6" />
              {t.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onMore}
          className={`flex flex-col items-center gap-0.5 pb-1 pt-1.5 text-[10px] font-medium ${
            moreActive || !inTabs ? "text-accent" : "text-label-2"
          }`}
        >
          <NavIcon name="more" className="h-6 w-6" />
          その他
        </button>
      </div>
    </nav>
  );
}
