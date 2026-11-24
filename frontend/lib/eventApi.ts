import { Event, EventCreateInput } from "./eventTypes";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      // レスポンスボディがJSONでない場合はステータスコードのみ使う
    }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function fetchEvents(): Promise<Event[]> {
  const res = await fetch(`${API_BASE}/api/events`, { cache: "no-store" });
  return handleResponse<Event[]>(res);
}

export async function createEvent(input: EventCreateInput): Promise<Event> {
  const res = await fetch(`${API_BASE}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return handleResponse<Event>(res);
}

export async function updateEvent(
  eventId: string,
  patch: Partial<EventCreateInput>
): Promise<Event> {
  const res = await fetch(`${API_BASE}/api/events/${eventId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return handleResponse<Event>(res);
}

export async function deleteEvent(eventId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/events/${eventId}`, {
    method: "DELETE",
  });
  return handleResponse<void>(res);
}

export async function setAttendance(eventId: string, status: "yes" | "no" | "maybe" | null): Promise<Event> {
  const res = await fetch(`${API_BASE}/api/events/${eventId}/attendance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  return handleResponse<Event>(res);
}

export interface ChecklistTemplate {
  id: string;
  name: string;
  items: string[];
}

export async function listTemplates(): Promise<ChecklistTemplate[]> {
  const res = await fetch(`${API_BASE}/api/checklist-templates`, { cache: "no-store" });
  return handleResponse<ChecklistTemplate[]>(res);
}

export async function saveTemplate(name: string, items: string[]): Promise<ChecklistTemplate> {
  const res = await fetch(`${API_BASE}/api/checklist-templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, items }),
  });
  return handleResponse<ChecklistTemplate>(res);
}
