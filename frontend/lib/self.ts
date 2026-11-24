// ログイン中のメンバー情報（AuthGate が提供）。
import { createContext, useContext } from "react";
import type { MeMember } from "./auth";

export interface AuthState {
  me: MeMember;
  authDisabled: boolean;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth は AuthGate の内側で使ってください");
  return ctx;
}

/** ログイン中のメンバー名 */
export function useSelf(): string {
  return useContext(AuthContext)?.me.name ?? "";
}

/** ログイン中のメンバーが管理者か */
export function useIsAdmin(): boolean {
  return useContext(AuthContext)?.me.role === "admin";
}
