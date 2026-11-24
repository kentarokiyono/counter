const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export interface MemberStat {
  name: string;
  online: boolean;
  session_seconds: number;
  active_seconds_today: number;
  active_seconds_7d: number;
  completed_tasks: number;
  in_progress_tasks: number;
}

export interface OnlineMember {
  name: string;
  session_seconds: number;
}

export interface RecentActivity {
  title: string;
  assignee_name: string | null;
  status: string;
  updated_at: string;
}

export interface DailyActivity {
  date: string;
  minutes: number;
}

export interface DailyCompletion {
  date: string;
  count: number;
}

// { name, <domain>: count, ... }
export type MemberDomainRow = { name: string } & Record<string, number>;

export interface ActivitySummary {
  generated_at: string;
  online: OnlineMember[];
  members: MemberStat[];
  recent: RecentActivity[];
  daily_activity: DailyActivity[];
  daily_completions: DailyCompletion[];
  member_domains: MemberDomainRow[];
}

export async function sendPing(): Promise<void> {
  await fetch(`${API_BASE}/api/activity/ping`, { method: "POST", keepalive: true });
}

export async function fetchOnline(): Promise<OnlineMember[]> {
  const res = await fetch(`${API_BASE}/api/activity/online`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.online ?? [];
}

export async function fetchActivitySummary(): Promise<ActivitySummary> {
  const res = await fetch(`${API_BASE}/api/activity/summary`, {
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      // JSONでない場合はステータスのみ
    }
    throw new Error(detail);
  }
  return res.json();
}
