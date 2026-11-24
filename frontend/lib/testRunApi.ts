// 活動ログ（現地活動・出展ごとの作業時間とメモ）。区分は backend/test_runs.py の TEAMS と一致させる。
import { getJson, sendJson } from "./http";
import type { Tone } from "./palette";

export type TeamKey = "prep" | "onsite" | "teardown" | "travel";

export const TEAMS: { key: TeamKey; name: string; tone: Tone }[] = [
  { key: "prep", name: "準備", tone: "blue" },
  { key: "onsite", name: "現地対応", tone: "green" },
  { key: "teardown", name: "撤収", tone: "orange" },
  { key: "travel", name: "移動", tone: "purple" },
];
export const TEAM_NAME = Object.fromEntries(TEAMS.map((t) => [t.key, t.name])) as Record<TeamKey, string>;
export const TEAM_TONE = Object.fromEntries(TEAMS.map((t) => [t.key, t.tone])) as Record<TeamKey, Tone>;

export interface TestRun {
  id: string;
  title: string;
  run_date: string | null;
  location: string | null;
  status: "active" | "done";
  created_by: string | null;
  created_at: string;
}

export interface Work {
  id: string;
  run_id: string;
  team: TeamKey;
  task: string;
  started_at: string;
  ended_at: string | null;
  created_by: string | null;
}

export interface RunLog {
  id: string;
  run_id: string;
  category: string;
  title: string;
  details: string | null;
  actor: string | null;
  created_at: string;
}

/** 作業の秒数。now は「サーバー時刻に合わせた今」（ミリ秒） */
export function workSeconds(w: Pick<Work, "started_at" | "ended_at">, now: number): number {
  const end = w.ended_at ? new Date(w.ended_at).getTime() : now;
  return Math.max(0, (end - new Date(w.started_at).getTime()) / 1000);
}

/** 秒 → 5:09 / 1:05:09 */
export function fmtDur(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const p = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(s % 60)}` : `${m}:${p(s % 60)}`;
}

/** 時刻 → 14:05 */
export const hm = (iso: string) => new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });

const base = "/api/test-runs";

export const listRuns = () => getJson<TestRun[]>(base);
export const createRun = (input: { title: string; run_date?: string; location?: string }) => sendJson<TestRun>("POST", base, input);
export const getRun = (id: string) =>
  getJson<{ run: TestRun; work: Work[]; logs: RunLog[]; server_now: string }>(`${base}/${id}`);
export const patchRun = (id: string, input: Partial<Pick<TestRun, "title" | "run_date" | "location" | "status">>) =>
  sendJson<TestRun>("PATCH", `${base}/${id}`, input);
export const deleteRun = (id: string) => sendJson<void>("DELETE", `${base}/${id}`);

export const addWork = (id: string, input: { team: TeamKey; task: string; started_at?: string; ended_at?: string }) =>
  sendJson<Work>("POST", `${base}/${id}/work`, input);
export const patchWork = (
  id: string,
  workId: string,
  input: { team?: TeamKey; task?: string; started_at?: string; ended_at?: string | null; finish?: boolean }
) => sendJson<Work>("PATCH", `${base}/${id}/work/${workId}`, input);
export const deleteWork = (id: string, workId: string) => sendJson<void>("DELETE", `${base}/${id}/work/${workId}`);
export const addLog = (id: string, input: { title: string; details?: string }) => sendJson<unknown>("POST", `${base}/${id}/logs`, input);
