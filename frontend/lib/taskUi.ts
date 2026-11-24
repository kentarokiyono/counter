import { BADGE } from "./palette";
import { Task, TaskDomain } from "./types";

export const DOMAIN_TAG_CLASSES: Record<TaskDomain, string> = {
  planning: BADGE.purple,
  pr: BADGE.pink,
  liaison: BADGE.orange,
  fieldwork: BADGE.green,
  survey: BADGE.teal,
  admin: BADGE.blue,
};

export type DueState = "overdue" | "soon" | "normal" | "none";

/** ローカル日付の YYYY-MM-DD（toISOString はUTCになるため使わない） */
export function todayStr(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 期限切れ: 今日より前 / 間近: 今日〜3日後。完了済みは対象外。 */
export function dueState(task: Pick<Task, "due_date" | "status">): DueState {
  if (!task.due_date || task.status === "done") return "none";
  if (task.due_date < todayStr()) return "overdue";
  if (task.due_date <= todayStr(3)) return "soon";
  return "normal";
}

export const DUE_BADGE_CLASSES: Record<DueState, string> = {
  overdue: BADGE.red,
  soon: BADGE.orange,
  normal: BADGE.gray,
  none: "",
};

export function formatDue(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  if (!m || !d) return dateStr;
  return `${Number(m)}/${Number(d)}`;
}

export function dueLabel(task: Pick<Task, "due_date" | "status">): string {
  if (!task.due_date) return "";
  const s = dueState(task);
  if (s === "overdue") return `期限切れ ${formatDue(task.due_date)}`;
  if (task.due_date === todayStr()) return "今日まで";
  return `〜${formatDue(task.due_date)}`;
}
