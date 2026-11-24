// SF Symbols 風の線アイコン（ナビゲーション用）
const PATHS: Record<string, React.ReactNode> = {
  "/": <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  "/tasks": (
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="m7.5 12 2.5 2.5 5-5" />
    </>
  ),
  "/events": (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  "/test-runs": (
    <>
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M12 13.5V9.5M10 3h4M18.5 6.5l1.5-1.5" />
    </>
  ),
  "/stickers": (
    <>
      <circle cx="8" cy="8" r="3.2" />
      <circle cx="16.5" cy="9.5" r="3.2" />
      <circle cx="10.5" cy="16.5" r="3.2" />
      <path d="M3 21h18" />
    </>
  ),
  "/analytics": <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  "/activity": (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  "/trash": <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />,
  "/log": <path d="M4 6h16M4 12h10M4 18h13" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.3" />
      <circle cx="12" cy="12" r="1.3" />
      <circle cx="19" cy="12" r="1.3" />
    </>
  ),
  module: (
    <>
      <path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </>
  ),
};

export default function NavIcon({ name, className = "h-5 w-5" }: { name: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[name] ?? PATHS.module}
    </svg>
  );
}
