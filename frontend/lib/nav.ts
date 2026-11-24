export interface NavItem {
  href: string;
  label: string;
  /** 管理者だけに出す */
  adminOnly?: boolean;
}

/** メインメニュー */
export const OPS_ITEMS: NavItem[] = [
  { href: "/", label: "ホーム" },
  { href: "/tasks", label: "タスク" },
  { href: "/events", label: "イベント" },
  { href: "/stickers", label: "シール集計" },
  { href: "/test-runs", label: "活動ログ" },
];

/** 「その他」にまとめるもの */
export const MORE_ITEMS: NavItem[] = [
  { href: "/analytics", label: "統計" },
  { href: "/log", label: "最近の動き", adminOnly: true },
  { href: "/trash", label: "ゴミ箱" },
];

/** スマホ下部タブに常に出すもの（残りは「その他」） */
export const TAB_HREFS = ["/", "/tasks", "/stickers", "/events"];

/** 今いるページがどのメニューに属するか（詳細画面は一覧のメニュー） */
export function activeHref(pathname: string): string {
  if (pathname.startsWith("/test-runs/")) return "/test-runs";
  if (pathname.startsWith("/stickers/")) return "/stickers";
  return pathname;
}

/** 権限に応じて出す項目を絞る */
export function visibleFor<T extends NavItem>(items: T[], isAdmin: boolean): T[] {
  return items.filter((i) => !i.adminOnly || isAdmin);
}
