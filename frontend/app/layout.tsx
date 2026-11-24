import type { Metadata, Viewport } from "next";
import "./globals.css";
import AppShell from "@/components/AppShell";
import AuthGate from "@/components/AuthGate";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export const metadata: Metadata = {
  title: "Toloc OS",
  description: "大阪大学 福島拠点 観光班 Toloc の公式OS",
};

// 描画前にテーマを適用してフラッシュを防ぐ（localStorage → OS設定の順）。
const THEME_INIT = `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        {/* ヒラギノが無い環境（Windows / Android）用の代替フォント */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/icons/icon-180.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Toloc OS" />
      </head>
      {/* メインコンテンツのダーク配色は globals.css の読み替えで適用する。 */}
      <body className="min-h-screen bg-grouped font-sans text-label">
        <AuthGate>
          <AppShell>{children}</AppShell>
        </AuthGate>
      </body>
    </html>
  );
}
