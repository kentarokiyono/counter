// 画面で起きたエラーをバックエンド経由で Discord に知らせる（同じエラーは1回だけ）。
import { API_BASE } from "./auth";

const reported = new Set<string>();
let installed = false;

const IGNORE = [/ResizeObserver loop/, /Script error\.?$/, /chrome-extension:/, /Loading chunk \d+ failed/, /NetworkError/];

function report(message: string, stack = "", source = "") {
  const key = message.slice(0, 200);
  if (!message || reported.has(key) || IGNORE.some((r) => r.test(message) || r.test(source))) return;
  reported.add(key);
  fetch(`${API_BASE}/api/client-errors`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: message.slice(0, 1000), stack: stack.slice(0, 3000), source: source.slice(0, 300), page: location.pathname }),
    keepalive: true,
  }).catch(() => {});
}

export function installErrorReporter(): void {
  if (installed || typeof window === "undefined" || process.env.NODE_ENV !== "production") return;
  installed = true;
  window.addEventListener("error", (e) => report(String(e.message), e.error?.stack ?? "", e.filename ?? ""));
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    report(r instanceof Error ? r.message : String(r), r instanceof Error ? r.stack ?? "" : "");
  });
}
