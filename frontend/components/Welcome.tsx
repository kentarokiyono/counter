"use client";

import { useEffect, useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { Avatar } from "@/components/AccountSheet";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/lib/self";
import { enablePush, getPushState } from "@/lib/push";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Step = "hello" | "push" | "install";

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true
  );
}

function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS/.test(ua);
}

/** 初めてログインしたときだけ出す3ステップ（ようこそ → 通知 → ホーム画面に追加） */
export default function Welcome() {
  const { me } = useAuth();
  const toast = useToast();
  const key = `toloc_welcomed_v1:${me.email}`;
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [index, setIndex] = useState(0);
  const [installEvent, setInstallEvent] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(key)) return;
    } catch {
      return;
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    (async () => {
      const list: Step[] = ["hello"];
      const push = await getPushState().catch(() => null);
      if (push?.kind === "off") list.push("push");
      const phone = /Android|iPhone|iPad|iPod/.test(navigator.userAgent);
      if (phone && !isStandalone()) list.push("install");
      setSteps(list);
    })();
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, [key]);

  function finish() {
    try {
      localStorage.setItem(key, "1");
    } catch {
      // noop
    }
    setSteps(null);
  }

  function next() {
    if (!steps) return;
    if (index + 1 >= steps.length) finish();
    else setIndex(index + 1);
  }

  if (!steps) return null;
  const step = steps[index];
  const last = index + 1 >= steps.length;

  return (
    <Sheet open onClose={finish} title="">
      <div className="flex min-h-[320px] flex-col items-center px-2 pb-2 pt-4 text-center">
        <div className="mb-6 flex gap-1.5">
          {steps.map((_, i) => (
            <span key={i} className={`h-1.5 w-6 rounded-full ${i <= index ? "bg-accent" : "bg-fill-strong"}`} />
          ))}
        </div>

        {step === "hello" && (
          <>
            <Avatar name={me.name} url={me.avatar_url} size={72} />
            <h2 className="mt-4 text-[24px] font-bold">ようこそ、{me.name}さん</h2>
            <p className="mt-2 text-[17px] text-label-2">Toloc OS で、タスク・イベント・シール集計をチームで共有します</p>
          </>
        )}

        {step === "push" && (
          <>
            <span className="flex h-[72px] w-[72px] items-center justify-center rounded-[20px] bg-p-red text-p-red-ink">
              <svg viewBox="0 0 24 24" className="h-10 w-10" fill="currentColor" aria-hidden>
                <path d="M12 2a6 6 0 0 0-6 6v4.2L4.3 15.6A1 1 0 0 0 5.2 17h13.6a1 1 0 0 0 .9-1.4L18 12.2V8a6 6 0 0 0-6-6zm0 20a3 3 0 0 0 3-3H9a3 3 0 0 0 3 3z" />
              </svg>
            </span>
            <h2 className="mt-4 text-[24px] font-bold">通知を受け取りますか？</h2>
            <p className="mt-2 text-[17px]">担当になったとき・期限の日に届きます</p>
          </>
        )}

        {step === "install" && (
          <>
            <img src="/icons/icon-192.png" alt="" className="h-[72px] w-[72px] rounded-[18px] shadow-sm" />
            <h2 className="mt-4 text-[24px] font-bold">ホーム画面に追加</h2>
            {!installEvent && isIosSafari() && (
              <p className="mt-3 flex flex-wrap items-center justify-center gap-1.5 text-[17px]">
                下の
                <svg viewBox="0 0 24 24" className="h-6 w-6 text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="共有">
                  <path d="M12 3v12M8 7l4-4 4 4M5 12v8h14v-8" />
                </svg>
                →「ホーム画面に追加」
              </p>
            )}
            {!installEvent && !isIosSafari() && (
              <p className="mt-3 text-[17px]">ブラウザのメニュー →「ホーム画面に追加」</p>
            )}
          </>
        )}

        <div className="mt-auto w-full space-y-2 pt-8">
          {step === "push" ? (
            <>
              <button
                type="button"
                className="ios-btn w-full py-3"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await enablePush();
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "オンにできませんでした");
                  } finally {
                    setBusy(false);
                    next();
                  }
                }}
              >
                オンにする
              </button>
              <button type="button" className="ios-btn-plain mx-auto block py-2" onClick={next}>
                あとで
              </button>
            </>
          ) : step === "install" && installEvent ? (
            <>
              <button
                type="button"
                className="ios-btn w-full py-3"
                onClick={async () => {
                  installEvent.prompt();
                  await installEvent.userChoice.catch(() => null);
                  setInstallEvent(null);
                  next();
                }}
              >
                追加する
              </button>
              <button type="button" className="ios-btn-plain mx-auto block py-2" onClick={next}>
                あとで
              </button>
            </>
          ) : (
            <button type="button" className="ios-btn w-full py-3" onClick={next}>
              {last ? "はじめる" : "次へ"}
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
