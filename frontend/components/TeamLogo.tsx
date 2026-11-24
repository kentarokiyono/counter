/** Toloc のロゴ（マーク + 文字。文字色はテーマに合わせる） */
export default function TeamLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`} role="img" aria-label="Toloc 大阪大学 福島拠点 観光班">
      <img src="/toloc-logo.png" alt="" className="h-11 w-11 shrink-0" />
      <span className="min-w-0 text-left leading-tight">
        <span className="block text-[22px] font-bold tracking-tight text-label">Toloc OS</span>
        <span className="block truncate text-[11px] font-medium text-label-2">大阪大学 福島拠点 観光班</span>
      </span>
    </span>
  );
}

/** 大阪大学 福島拠点のロゴ（ダークでは文字を白に） */
export function CenterLogo({ className = "" }: { className?: string }) {
  return (
    <>
      <img src="/fukushima-center.png" alt="大阪大学 福島拠点" className={`dark:hidden ${className}`} />
      <img src="/fukushima-center-dark.png" alt="大阪大学 福島拠点" className={`hidden dark:block ${className}`} />
    </>
  );
}
