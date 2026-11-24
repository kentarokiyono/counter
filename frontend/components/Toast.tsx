"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

type ToastKind = "success" | "error" | "info";

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  /** href: 別タブで開くリンク / onClick: 「元に戻す」などの操作 */
  action?: { label: string; href?: string; onClick?: () => void };
}

interface ToastApi {
  success: (message: string, action?: ToastItem["action"]) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DOT_CLASSES: Record<ToastKind, string> = {
  success: "bg-success",
  error: "bg-danger",
  info: "bg-label-3",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string, action?: ToastItem["action"]) => {
      const id = nextId.current++;
      setItems((prev) => [...prev.slice(-3), { id, kind, message, action }]);
      // 操作ボタン付きは押す時間を確保する
      window.setTimeout(() => dismiss(id), kind === "error" ? 7000 : action?.onClick ? 7000 : 4000);
    },
    [dismiss]
  );

  const api = useRef<ToastApi>({
    success: (m, a) => push("success", m, a),
    error: (m) => push("error", m),
    info: (m) => push("info", m),
  }).current;

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-14 z-70 flex flex-col items-center gap-2 px-4 md:bottom-6 md:top-auto md:items-end"
        aria-live="polite"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className="pointer-events-auto flex w-full max-w-sm animate-fade-in items-start gap-2.5 rounded-2xl bg-elevated px-4 py-3 text-[15px] text-label shadow-[0_8px_30px_rgba(0,0,0,0.18)] backdrop-blur-xl"
          >
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT_CLASSES[t.kind]}`} />
            <p className="flex-1 wrap-break-word">
              {t.message}
              {t.action?.href && (
                <a
                  href={t.action.href}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-2 font-semibold text-accent"
                >
                  {t.action.label}
                </a>
              )}
            </p>
            {t.action?.onClick && (
              <button
                type="button"
                onClick={() => {
                  t.action?.onClick?.();
                  dismiss(t.id);
                }}
                className="shrink-0 font-semibold text-accent"
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="閉じる"
              className="text-label-3 hover:text-label dark:hover:text-white"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast は ToastProvider の内側で使ってください");
  return ctx;
}
