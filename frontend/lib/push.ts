// スマホへの通知（Web Push）の購読。ホーム画面に追加したアプリ（iPhone は iOS 16.4 以降）で使える。
import { getJson, sendJson } from "./http";

export type PushState =
  | { kind: "unsupported"; reason: string }
  | { kind: "server-disabled" }
  | { kind: "denied" }
  | { kind: "off" }
  | { kind: "on" };

function isIos(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

export async function getPushState(): Promise<PushState> {
  if (typeof window === "undefined" || !("Notification" in window) || !("PushManager" in window)) {
    if (typeof window !== "undefined" && isIos() && !isStandalone()) {
      return { kind: "unsupported", reason: "iPhoneでは、Safariの共有メニューから「ホーム画面に追加」したアプリで使えます" };
    }
    return { kind: "unsupported", reason: "このブラウザは通知に対応していません" };
  }
  const server = await getJson<{ enabled: boolean; public_key: string | null }>("/api/push/public-key").catch(() => null);
  if (!server?.enabled) return { kind: "server-disabled" };
  if (Notification.permission === "denied") return { kind: "denied" };
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? { kind: "on" } : { kind: "off" };
}

export async function enablePush(): Promise<void> {
  const server = await getJson<{ enabled: boolean; public_key: string | null }>("/api/push/public-key");
  if (!server.enabled || !server.public_key) throw new Error("通知はまだ設定されていません");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("通知が許可されませんでした");
  const reg = await registration();
  if (!reg) throw new Error("アプリの準備ができていません。再読み込みしてください");
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(server.public_key) as BufferSource,
    }));
  await sendJson("POST", "/api/push/subscribe", sub.toJSON());
}

export async function disablePush(): Promise<void> {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await sendJson("POST", "/api/push/unsubscribe", { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
}

export const sendTestPush = () => sendJson<{ sent: number }>("POST", "/api/push/test");
