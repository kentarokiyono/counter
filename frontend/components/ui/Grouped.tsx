"use client";

import Link from "next/link";

/** iOS の「角丸グループリスト」（設定アプリのセクション） */
export function Group({
  title,
  children,
  className = "",
  action,
}: {
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** セクション見出し右側のリンク等 */
  action?: React.ReactNode;
}) {
  return (
    <section className={`mb-6 ${className}`}>
      {(title || action) && (
        <div className="flex items-end justify-between px-4 pb-1.5">
          <h2 className="text-[13px] text-label-2">{title}</h2>
          {action && <div className="text-[13px]">{action}</div>}
        </div>
      )}
      <div className="overflow-hidden rounded-xl bg-card [&>*+*]:border-t [&>*+*]:border-separator">
        {children}
      </div>
    </section>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 8 13" className="h-[13px] w-2 shrink-0 text-label-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 1.5l5 5-5 5" />
    </svg>
  );
}

/** グループ内の1行。href / onClick があれば押せる行になる */
export function Row({
  children,
  detail,
  href,
  onClick,
  chevron,
  destructive,
  className = "",
  leading,
}: {
  children: React.ReactNode;
  detail?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  className?: string;
  leading?: React.ReactNode;
}) {
  const inner = (
    <>
      {leading}
      <div className={`min-w-0 flex-1 ${destructive ? "text-danger" : ""}`}>{children}</div>
      {detail !== undefined && <div className="shrink-0 text-[15px] text-label-2">{detail}</div>}
      {(chevron ?? !!href) && <Chevron />}
    </>
  );
  const cls = `flex min-h-[44px] w-full items-center gap-3 px-4 py-2.5 text-left text-[15px] ${className}`;
  if (href)
    return (
      <Link href={href} className={`${cls} active:bg-fill`}>
        {inner}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={`${cls} active:bg-fill`}>
        {inner}
      </button>
    );
  return <div className={cls}>{inner}</div>;
}

/** フォーム用: ラベル付きの1行（入力欄を右に置く / 下に置く） */
export function Field({
  label,
  children,
  required,
  group,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  /** 中身がボタンの並び（セグメント等）のときは true（label で包むと先頭のボタンに名前が付いてしまう） */
  group?: boolean;
}) {
  const caption = (
    <span className="mb-1 block px-1 text-[13px] text-label-2">
      {label}
      {required && <span className="ml-0.5 text-danger">*</span>}
    </span>
  );
  if (group)
    return (
      <div role="group" aria-label={label} className="block">
        {caption}
        {children}
      </div>
    );
  return (
    <label className="block">
      {caption}
      {children}
    </label>
  );
}
