// ログイン（Supabase Auth の Google / Microsoft ログイン）と、バックエンド呼び出しへのトークン付与。
import { getSupabaseClient } from "./supabase";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
/** ログイン画面で優先表示するドメイン（Google の hd。最終的な制限はバックエンドで行う） */
export const LOGIN_HINT_DOMAIN = process.env.NEXT_PUBLIC_LOGIN_HINT_DOMAIN ?? "";
/** "google"（既定）または "azure"（Microsoft 365 の大学アカウント） */
export const AUTH_PROVIDER: "google" | "azure" = process.env.NEXT_PUBLIC_AUTH_PROVIDER === "azure" ? "azure" : "google";
/** メンバー追加でメールの @ 以降を省略したときに補うドメイン */
export const MEMBER_EMAIL_DOMAIN = process.env.NEXT_PUBLIC_MEMBER_EMAIL_DOMAIN || "ecs.osaka-u.ac.jp";
export const AUTH_EXPIRED_EVENT = "toloc-auth-expired";

export interface MeMember {
  id: string;
  name: string;
  email: string;
  role: "member" | "admin";
  avatar_url?: string | null;
}

export async function getAccessToken(): Promise<string | null> {
  try {
    const { data } = await getSupabaseClient().auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

export async function signIn(): Promise<void> {
  const redirectTo = window.location.origin + window.location.pathname;
  const { error } =
    AUTH_PROVIDER === "azure"
      ? await getSupabaseClient().auth.signInWithOAuth({
          provider: "azure",
          options: { redirectTo, scopes: "email", queryParams: { prompt: "select_account" } },
        })
      : await getSupabaseClient().auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo,
            queryParams: { prompt: "select_account", ...(LOGIN_HINT_DOMAIN ? { hd: LOGIN_HINT_DOMAIN } : {}) },
          },
        });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  try {
    await getSupabaseClient().auth.signOut();
  } finally {
    // オフライン用キャッシュも消す（PWA）
    try {
      navigator.serviceWorker?.controller?.postMessage({ type: "clear-cache" });
    } catch {
      // noop
    }
  }
}

let installed = false;

/**
 * window.fetch を一度だけラップし、バックエンド(API_BASE)宛のリクエストに
 * Authorization: Bearer <Supabaseのアクセストークン> を自動付与する。
 * 401 が返ったらログイン切れとしてイベントを発火する。
 */
export function installFetchAuth(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    if (!url || !url.startsWith(API_BASE)) return orig(input, init);
    const token = await getAccessToken();
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    if (token) headers.set("authorization", `Bearer ${token}`);
    const res = await orig(input, { ...init, headers });
    if (res.status === 401 && !url.endsWith("/api/me")) {
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    return res;
  };
}

export async function fetchMe(): Promise<
  { ok: true; member: MeMember; authDisabled: boolean } | { ok: false; status: number; detail: string; code?: string }
> {
  try {
    const res = await fetch(`${API_BASE}/api/me`, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, detail: body?.detail ?? `HTTP ${res.status}`, code: body?.code };
    return { ok: true, member: body.member, authDisabled: !!body.auth_disabled };
  } catch {
    return { ok: false, status: 0, detail: "サーバーに接続できません" };
  }
}

/** SSE（EventSource）はヘッダを付けられないため、短期チケットをクエリで渡す */
export async function getStreamTicket(): Promise<string> {
  const res = await fetch(`${API_BASE}/api/auth/ticket`, { method: "POST" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.ticket as string;
}

/**
 * チケット付きの EventSource を開き、切断されたら新しいチケットで張り直す。
 * onReconnect は再接続できた時に呼ばれる（取りこぼした更新を再取得するため）。
 */
export function openTicketedStream(
  url: string,
  handlers: {
    onMessage: (data: string) => void;
    onOpen?: () => void;
    onError?: () => void;
    onReconnect?: () => void;
  }
): () => void {
  let source: EventSource | null = null;
  let closed = false;
  let retry = 0;
  let opened = false;
  let timer: number | null = null;

  async function connect() {
    if (closed) return;
    try {
      const ticket = await getStreamTicket();
      if (closed) return;
      const sep = url.includes("?") ? "&" : "?";
      source = new EventSource(`${url}${sep}ticket=${encodeURIComponent(ticket)}`);
      source.onmessage = (e) => handlers.onMessage(e.data);
      source.onopen = () => {
        retry = 0;
        handlers.onOpen?.();
        if (opened) handlers.onReconnect?.();
        opened = true;
      };
      source.onerror = () => {
        handlers.onError?.();
        // チケット切れ等で閉じた場合は自前で張り直す（開いたままなら EventSource が自動再接続する）
        if (source && source.readyState === EventSource.CLOSED) {
          source = null;
          schedule();
        }
      };
    } catch {
      handlers.onError?.();
      schedule();
    }
  }

  function schedule() {
    if (closed) return;
    const delay = Math.min(30000, 1000 * 2 ** retry++);
    timer = window.setTimeout(connect, delay);
  }

  connect();
  return () => {
    closed = true;
    if (timer) window.clearTimeout(timer);
    source?.close();
  };
}
