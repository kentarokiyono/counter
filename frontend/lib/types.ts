/**
 * バックエンド task_manager.py の TaskOut / TaskCreate / TaskUpdate と対応させること。
 * status・domain の候補値は schema.sql のCHECK制約と一致させる。
 */
export type TaskStatus = "todo" | "in_progress" | "review" | "done";

/** 分類。backend/domains.py・schema.sql と一致させる */
export type TaskDomain = "planning" | "pr" | "liaison" | "fieldwork" | "survey" | "admin";

export interface TaskChecklistItem {
  item: string;
  done: boolean;
}

/** 繰り返し: 完了にすると次の回が自動で作られる */
export type TaskRepeat = "daily" | "weekly" | "monthly";

export const TASK_REPEAT_LABELS: Record<TaskRepeat, string> = {
  daily: "毎日",
  weekly: "毎週",
  monthly: "毎月",
};

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  assignee_name: string | null;
  domain: TaskDomain | null;
  due_date: string | null;
  checklist?: TaskChecklistItem[];
  repeat?: TaskRepeat | null;
  created_at: string;
  updated_at: string;
}

export interface TaskCreateInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  assignee_name?: string;
  domain?: TaskDomain;
  due_date?: string;
  checklist?: TaskChecklistItem[];
  repeat?: TaskRepeat;
}

/** PATCH用。null を送るとその項目をクリアする（title/status は null 不可）。 */
export interface TaskUpdateInput {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  assignee_name?: string | null;
  domain?: TaskDomain | null;
  due_date?: string | null;
  checklist?: TaskChecklistItem[];
  repeat?: TaskRepeat | null;
}

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "未着手",
  in_progress: "進行中",
  review: "確認待ち",
  done: "完了",
};

export const TASK_STATUS_ORDER: TaskStatus[] = [
  "todo",
  "in_progress",
  "review",
  "done",
];

export const TASK_DOMAIN_LABELS: Record<TaskDomain, string> = {
  planning: "企画",
  pr: "広報・SNS",
  liaison: "地域連携・渉外",
  fieldwork: "現地活動",
  survey: "調査・集計",
  admin: "会計・事務",
};
