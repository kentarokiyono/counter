/** Toloc のロゴ（マーク + 文字。文字色はテーマに合わせる） */
export default function TeamLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`} role="img" aria-label="Toloc 大阪大学 福島拠点 観光班">
      <img src="/logo-mark.svg" alt="" className="h-10 w-10 shrink-0" />
      <span className="min-w-0 text-left leading-tight">
        <span className="block text-[22px] font-bold tracking-tight text-label">Toloc</span>
        <span className="block truncate text-[11px] font-medium text-label-2">大阪大学 福島拠点 観光班</span>
      </span>
    </span>
  );
}
