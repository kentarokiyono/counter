import Link from "next/link";

interface ModulePageHeaderProps {
  title: string;
  /** iOS の「戻る」（例: 書類の各画面 → 書類） */
  back?: { href: string; label: string };
  /** 右側に置くボタン等。モバイルではタイトルの下に回り込む */
  actions?: React.ReactNode;
}

/**
 * 各ルートページ共通のヘッダー（タイトル + 説明）。
 * ナビゲーションは左サイドバー（Sidebar.tsx）が担うため、戻るリンクは持たない。
 */
export default function ModulePageHeader({
  title,
  back,
  actions,
}: ModulePageHeaderProps) {
  return (
    <div className="mb-6 flex items-start justify-between gap-3">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="ios-btn-plain -ml-1 mb-1 text-[17px]">
            <svg viewBox="0 0 12 20" className="h-[17px] w-2.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 2 2 10l8 8" />
            </svg>
            {back.label}
          </Link>
        )}
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-label md:text-[34px]">
          {title}
        </h1>
      </div>
      {actions && (
        <div className="flex shrink-0 flex-nowrap items-center justify-end gap-2 pt-1">{actions}</div>
      )}
    </div>
  );
}
