import { getJson, sendJson } from "./http";

export interface ActivityEntry {
  id: string;
  created_at: string;
  actor: string;
  kind: string;
  action: string;
  summary: string;
}
export const listActivity = (limit = 20) => getJson<ActivityEntry[]>(`/api/activity-log?limit=${limit}`);

export interface ActivityFilter {
  actor?: string;
  kind?: string;
  since?: string;
  until?: string;
  before?: string;
}
export function searchActivity(f: ActivityFilter, limit = 50): Promise<ActivityEntry[]> {
  const q = new URLSearchParams({ limit: String(limit) });
  for (const [k, v] of Object.entries(f)) if (v) q.set(k, v);
  return getJson<ActivityEntry[]>(`/api/activity-log?${q.toString()}`);
}

export const KIND_LABELS: Record<string, string> = {
  task: "タスク",
  event: "イベント",
  test_run: "活動ログ",
  sticker: "シール集計",
  member: "メンバー",
};

export interface TrashItem {
  kind: string;
  kind_label: string;
  id: string;
  label: string;
  deleted_at: string;
  deleted_by: string | null;
}
export const listTrash = () => getJson<{ retention_days: number; items: TrashItem[] }>("/api/trash");
export const purgeTrash = (kind: string, id: string) => sendJson<unknown>("DELETE", `/api/trash/${kind}/${id}`);
export const emptyTrash = () => sendJson<{ deleted: number }>("DELETE", "/api/trash");
export const restoreTrash = (kind: string, id: string) => sendJson<unknown>("POST", `/api/trash/${kind}/${id}/restore`);

/** 日付（YYYY-MM-DD）までの残り日数（ローカル日付基準） */
export function daysUntil(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = new Date(y, m - 1, d).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - today) / 86400000);
}

export function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "たった今";
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}日前`;
  return new Date(iso).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}
