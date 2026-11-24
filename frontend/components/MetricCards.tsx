"use client";

interface MetricCardProps {
  label: string;
  value: string;
  sublabel?: string;
  tone?: "default" | "warning";
}

function MetricCard({ label, value, sublabel, tone = "default" }: MetricCardProps) {
  return (
    <div className="rounded-2xl bg-card px-4 py-3">
      <p className="text-[13px] text-label-2">{label}</p>
      <p
        className={`tabular-nums mt-0.5 text-[28px] font-bold leading-tight ${
          tone === "warning" ? "text-danger" : "text-label"
        }`}
      >
        {value}
      </p>
      {sublabel && <p className="text-xs text-label-3 mt-1">{sublabel}</p>}
    </div>
  );
}

interface MetricCardsProps {
  taskTotal: number;
  taskCompletionRate: number;
  taskOverdueCount: number;
  eventUpcomingCount: number;
}

export default function MetricCards({
  taskTotal,
  taskCompletionRate,
  taskOverdueCount,
  eventUpcomingCount,
}: MetricCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <MetricCard label="総タスク数" value={String(taskTotal)} />
      <MetricCard
        label="完了率"
        value={`${Math.round(taskCompletionRate * 100)}%`}
      />
      <MetricCard
        label="期限超過"
        value={String(taskOverdueCount)}
        tone={taskOverdueCount > 0 ? "warning" : "default"}
        sublabel={taskOverdueCount > 0 ? "要確認" : undefined}
      />
      <MetricCard label="今後のイベント" value={String(eventUpcomingCount)} />
    </div>
  );
}
