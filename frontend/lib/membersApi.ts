import { API_BASE } from "./auth";

export interface Member {
  id: string;
  name: string;
  email: string | null;
  role: "member" | "admin";
  avatar_url?: string | null;
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const b = await res.json();
      if (b?.detail) detail = b.detail;
    } catch {
      // noop
    }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function listMembers(): Promise<Member[]> {
  const res = await fetch(`${API_BASE}/api/members`, { cache: "no-store" });
  return handle<Member[]>(res);
}

/** 管理者は登録、それ以外は参加の申請になる（requested: true） */
export async function addMember(name: string, email: string): Promise<Member & { requested?: boolean }> {
  const res = await fetch(`${API_BASE}/api/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email }),
  });
  return handle<Member>(res);
}

export async function updateMember(
  id: string,
  input: Partial<Pick<Member, "name" | "email" | "role">>
): Promise<Member> {
  const res = await fetch(`${API_BASE}/api/members/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return handle<Member>(res);
}

export async function deleteMember(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/members/${id}`, { method: "DELETE" });
  return handle<void>(res);
}

export interface HandoverItem {
  id: string;
  title: string;
}

export interface HandoverPreview {
  name: string;
  tasks: HandoverItem[];
  events: HandoverItem[];
}

/** 未完了の担当（タスク・イベント）の一覧 */
export async function getHandover(id: string): Promise<HandoverPreview> {
  const res = await fetch(`${API_BASE}/api/members/${id}/handover`, { cache: "no-store" });
  return handle<HandoverPreview>(res);
}

/** 担当を to に移す（null なら未割当） */
export async function handover(id: string, to: string | null): Promise<{ tasks: number; events: number }> {
  const res = await fetch(`${API_BASE}/api/members/${id}/handover`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to }),
  });
  return handle(res);
}

export interface MemberRequest {
  id: string;
  email: string;
  name: string;
  note: string | null;
  requested_by: string | null;
  created_at: string;
}

/** 許可待ちの参加申請（管理者のみ） */
export async function listRequests(): Promise<MemberRequest[]> {
  return handle(await fetch(`${API_BASE}/api/member-requests`, { cache: "no-store" }));
}

export async function approveRequest(id: string, name?: string): Promise<Member> {
  return handle(
    await fetch(`${API_BASE}/api/member-requests/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(name ? { name } : {}),
    })
  );
}

export async function rejectRequest(id: string): Promise<unknown> {
  return handle(await fetch(`${API_BASE}/api/member-requests/${id}/reject`, { method: "POST" }));
}
