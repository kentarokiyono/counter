/**
 * backend/analytics.py の AnalyticsSummary と対応させること。
 */
export interface TaskSummary {
  total: number;
  by_status: Record<string, number>;
  by_domain: Record<string, number>;
  completion_rate: number;
  overdue_count: number;
}

export interface EventSummary {
  total: number;
  by_status: Record<string, number>;
  upcoming_count: number;
}

export interface AnalyticsSummary {
  tasks: TaskSummary;
  events: EventSummary;
  generated_at: string;
}
