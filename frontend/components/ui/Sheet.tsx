"use client";

import { useEffect, useRef, useState } from "react";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  /** 左上（キャンセル等）と右上（保存等）のボタン。iOS のナビゲーションバー風 */
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  children: React.ReactNode;
  /** 閉じられない状態（送信中など） */
  locked?: boolean;
  size?: "md" | "lg";
}

/**
 * iOS 風シート。スマホでは画面下からせり上がり、下に引くと閉じる。
 * md 以上では中央のダイアログとして表示する。
 */
export default function Sheet({
  open,
  onClose,
  title,
  leading,
  trailing,
  children,
  locked,
  size = "md",
}: SheetProps) {
  const [dragY, setDragY] = useState(0);
  const startY = useRef<number | null>(null);
  // 呼び出し側がインライン関数を渡しても effect を張り直さないよう ref で持つ
  const closeRef = useRef(onClose);
  const lockedRef = useRef(locked);
  closeRef.current = onClose;
  lockedRef.current = locked;

  useEffect(() => {
    if (!open) return;
    setDragY(0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !lockedRef.current) closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open) return null;

  function onTouchStart(e: React.TouchEvent) {
    startY.current = e.touches[0].clientY;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (startY.current === null) return;
    setDragY(Math.max(0, e.touches[0].clientY - startY.current));
  }
  function onTouchEnd() {
    if (dragY > 110 && !locked) onClose();
    setDragY(0);
    startY.current = null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-end justify-center bg-black/40 md:items-center md:p-6"
      onClick={() => !locked && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        onClick={(e) => e.stopPropagation()}
        style={dragY ? { transform: `translateY(${dragY}px)`, transition: "none" } : undefined}
        className={`flex max-h-[92vh] w-full animate-sheet-up flex-col overflow-hidden rounded-t-[14px] bg-grouped text-label shadow-2xl transition-transform md:animate-fade-in md:rounded-[14px] ${
          size === "lg" ? "md:max-w-2xl" : "md:max-w-lg"
        }`}
      >
        {/* つまみ（スマホのみ）。ここを引いて閉じる */}
        <div
          className="flex shrink-0 justify-center pb-1 pt-2 md:hidden"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <span className="h-[5px] w-9 rounded-full bg-label-3" />
        </div>
        {(title || leading || trailing) && (
          <div
            className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 pb-2 pt-1 md:pt-3"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            <div className="justify-self-start">{leading}</div>
            <h2 className="truncate text-center text-[17px] font-semibold">{title}</h2>
            <div className="justify-self-end">{trailing}</div>
          </div>
        )}
        <div className="overflow-y-auto overscroll-contain px-4 pb-6 pt-1 pb-safe">{children}</div>
      </div>
    </div>
  );
}
