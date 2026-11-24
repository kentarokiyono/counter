"use client";

import { useCallback, useEffect, useState } from "react";
import { AUTH_EXPIRED_EVENT, AUTH_PROVIDER, MeMember, fetchMe, installFetchAuth, signIn, signOut } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";
import { AuthContext } from "@/lib/self";
import { CenterLogo } from "@/components/TeamLogo";
import JoinRequest from "@/components/JoinRequest";
import { installErrorReporter } from "@/lib/errorReporter";

type State =
  | { kind: "checking" }
  | { kind: "login"; message?: string }
  | { kind: "denied"; message: string }
  | { kind: "join" }
  | { kind: "offline" }
  | { kind: "authed"; me: MeMember; authDisabled: boolean };

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 23 23" className="h-5 w-5" aria-hidden>
      <path fill="#f35325" d="M1 1h10v10H1z" />
      <path fill="#81bc06" d="M12 1h10v10H12z" />
      <path fill="#05a6f0" d="M1 12h10v10H1z" />
      <path fill="#ffba08" d="M12 12h10v10H12z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-grouped p-6">
      <div className="w-full max-w-sm rounded-2xl bg-card p-6 text-center shadow-xs">
        <img src="/toloc-logo.png" alt="Toloc トロック" className="mx-auto mb-4 h-28 w-28" />
        <h1 className="text-lg font-semibold text-label">Toloc OS</h1>
        <p className="mt-1 text-sm text-label-2">大阪大学 福島拠点 観光班</p>
        {children}
        <CenterLogo className="mx-auto mt-8 h-auto w-full max-w-[220px]" />
      </div>
    </div>
  );
}

/** Googleログインから戻ったURLに付くエラー（?error_description= または #error_description=） */
function oauthError(): string | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search);
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return q.get("error_description") || h.get("error_description") || q.get("error") || h.get("error");
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ kind: "checking" });
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    // Googleから戻ったURLの読み取りに失敗した場合は、その理由を表示する（ループに見えないように）
    const init = await getSupabaseClient()
      .auth.initialize()
      .catch(() => ({ error: null }));
    const res = await fetchMe();
    if (!res.ok && res.status === 401 && init.error) {
      setState({ kind: "login", message: `ログインできませんでした（${init.error.message}）` });
      return;
    }
    if (res.ok) {
      setState({ kind: "authed", me: res.member, authDisabled: res.authDisabled });
    } else if (res.status === 403 && res.code === "not_member") {
      setState({ kind: "join" });
    } else if (res.status === 403) {
      setState({ kind: "denied", message: res.detail });
    } else if (res.status === 401 && oauthError()) {
      setState({ kind: "login", message: `ログインできませんでした（${oauthError()}）` });
    } else if (res.status === 401) {
      // Googleから戻ったのにバックエンドに断られた場合は、理由を出してループに見えないようにする
      const { data } = await getSupabaseClient().auth.getSession();
      setState(data.session ? { kind: "login", message: `ログインできませんでした（${res.detail}）` } : { kind: "login" });
    } else {
      setState({ kind: "offline" });
    }
  }, []);

  useEffect(() => {
    try {
      getSupabaseClient();
    } catch (e) {
      // Supabase の公開設定が無いビルドでも真っ白にせず、原因を表示する
      setState({ kind: "denied", message: e instanceof Error ? e.message : String(e) });
      return;
    }
    installFetchAuth();
    installErrorReporter();
    check();
    // ログイン完了（OAuthから戻った直後）やトークン更新で再確認する
    const { data } = getSupabaseClient().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") check();
    });
    const onExpired = () => setState({ kind: "login", message: "ログインの有効期限が切れました" });
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
    };
  }, [check]);

  async function login() {
    setBusy(true);
    try {
      await signIn();
    } catch {
      setBusy(false);
      setState({ kind: "login", message: "ログインを開始できませんでした" });
    }
  }

  async function logout() {
    await signOut();
    setState({ kind: "login" });
  }

  if (state.kind === "authed") {
    return (
      <AuthContext.Provider value={{ me: state.me, authDisabled: state.authDisabled, signOut: logout }}>
        {children}
      </AuthContext.Provider>
    );
  }

  if (state.kind === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-grouped text-sm text-label-3">
        読み込み中...
      </div>
    );
  }

  if (state.kind === "offline") {
    return (
      <Shell>
        <p className="mt-5 text-sm text-label-2">サーバーに接続できません</p>
        <button
          type="button"
          onClick={() => {
            setState({ kind: "checking" });
            check();
          }}
          className="mt-4 w-full rounded-xl bg-accent-soft px-4 py-3 text-[15px] font-semibold text-accent-ink"
        >
          再読み込み
        </button>
      </Shell>
    );
  }

  if (state.kind === "join") {
    return (
      <Shell>
        <JoinRequest onApproved={check} onSignOut={logout} />
      </Shell>
    );
  }

  if (state.kind === "denied") {
    return (
      <Shell>
        <p className="mt-5 rounded-xl bg-p-red px-3 py-2.5 text-left text-sm text-p-red-ink">{state.message}</p>
        <button
          type="button"
          onClick={logout}
          className="mt-4 w-full rounded-xl bg-fill px-4 py-3 text-[15px] font-semibold text-accent"
        >
          別のアカウントでログイン
        </button>
      </Shell>
    );
  }

  return (
    <Shell>
      {state.message && <p className="mt-4 text-sm text-danger">{state.message}</p>}
      <button
        type="button"
        onClick={login}
        disabled={busy}
        className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-xl border border-separator bg-card px-4 py-3 text-[15px] font-semibold text-label disabled:opacity-50"
      >
        {AUTH_PROVIDER === "azure" ? <MicrosoftIcon /> : <GoogleIcon />}
        {busy ? "移動中..." : "大学のアカウントでログイン"}
      </button>
    </Shell>
  );
}
