// 無操作が続いたら自動でログアウトする（共用PC向け。端末ごとの設定、既定はしない）。
import { useEffect, useRef } from "react";

const LIMIT_KEY = "toloc.idleLogout.minutes";
const LAST_KEY = "toloc.lastActive";
export const IDLE_OPTIONS = ["0", "30", "120", "480"] as const;
export type IdleOption = (typeof IDLE_OPTIONS)[number];

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 保存できない環境では無効
  }
}

export function getIdleLimit(): IdleOption {
  const v = read(LIMIT_KEY);
  return (IDLE_OPTIONS as readonly string[]).includes(v ?? "") ? (v as IdleOption) : "0";
}

export function setIdleLimit(v: IdleOption): void {
  write(LIMIT_KEY, v);
  write(LAST_KEY, String(Date.now()));
}

/** 最後の操作から設定時間を過ぎていたら onExpire を呼ぶ。他のタブでの操作も数える */
export function useIdleLogout(onExpire: () => void): void {
  const expire = useRef(onExpire);
  expire.current = onExpire;
  useEffect(() => {
    let lastWrite = 0;
    const touch = () => {
      const now = Date.now();
      // 書き込みは30秒に1回まで
      if (now - lastWrite > 30_000) {
        lastWrite = now;
        write(LAST_KEY, String(now));
      }
    };
    const check = () => {
      const minutes = Number(getIdleLimit());
      if (!minutes) return;
      const last = Number(read(LAST_KEY) ?? 0);
      if (last && Date.now() - last > minutes * 60_000) {
        write(LAST_KEY, String(Date.now()));
        expire.current();
      }
    };
    // 起動時: 前回の操作から時間が経っていればログアウト
    check();
    touch();
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const timer = setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch));
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
}
