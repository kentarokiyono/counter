import { BADGE } from "./palette";
/**
 * バックエンド event_manager.py の EventOut / EventCreate / EventUpdate と対応させること。
 */
export type EventStatus =
  | "planned"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface ChecklistItem {
  item: string;
  done: boolean;
}

export type Attendance = "yes" | "no" | "maybe";

export interface Event {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_time: string;
  end_time: string | null;
  status: EventStatus;
  assignees: string[];
  checklist: ChecklistItem[];
  /** 出欠 { メンバー名: "yes" | "no" | "maybe" } */
  attendance?: Record<string, Attendance>;
  created_at: string;
  updated_at: string;
}

export interface EventCreateInput {
  title: string;
  description?: string;
  location?: string;
  start_time: string;
  end_time?: string;
  status?: EventStatus;
  assignees?: string[];
  checklist?: ChecklistItem[];
}

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  planned: "計画中",
  confirmed: "確定",
  in_progress: "進行中",
  completed: "完了",
  cancelled: "中止",
};

export const EVENT_STATUS_COLORS: Record<EventStatus, string> = {
  planned: BADGE.gray,
  confirmed: BADGE.blue,
  in_progress: BADGE.orange,
  completed: BADGE.green,
  cancelled: BADGE.red,
};
