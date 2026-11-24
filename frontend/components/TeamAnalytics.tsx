"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import MetricCards from "@/components/MetricCards";
import TeamOverview from "@/components/TeamOverview";
import { fetchAnalyticsSummary } from "@/lib/analyticsApi";
import { AnalyticsSummary } from "@/lib/analyticsTypes";
import { TASK_STATUS_LABELS, TASK_DOMAIN_LABELS } from "@/lib/types";
import { EVENT_STATUS_LABELS } from "@/lib/eventTypes";

const PIE_COLORS = ["#cfd0d6", "#a9d3ee", "#f2c98f", "#a3d6b8", "#eeb0ab"];
const BAR_COLOR = "#a9d3ee";

function EmptyOrChart({
  hasData,
  children,
}: {
  hasData: boolean;
  children: React.ReactNode;
}) {
  if (!hasData) {
    return <p className="text-sm text-label-3 py-8 text-center">データがありません</p>;
  }
  return <>{children}</>;
}

export default function TeamAnalytics() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await fetchAnalyticsSummary();
        if (!cancelled) {
          setSummary(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "取得に失敗しました");
        }
      }
    }

    load();
    const interval = setInterval(load, 30000); // 30秒ごとに自動更新
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const taskStatusData = summary
    ? Object.entries(summary.tasks.by_status).map(([key, value]) => ({
        name: TASK_STATUS_LABELS[key as keyof typeof TASK_STATUS_LABELS] ?? key,
        value,
      }))
    : [];

  const taskDomainData = summary
    ? Object.entries(summary.tasks.by_domain)
        .map(([key, value]) => ({
          name:
            TASK_DOMAIN_LABELS[key as keyof typeof TASK_DOMAIN_LABELS] ?? key,
          value,
        }))
        .filter((d) => d.value > 0)
    : [];

  const eventStatusData = summary
    ? Object.entries(summary.events.by_status)
        .map(([key, value]) => ({
          name:
            EVENT_STATUS_LABELS[key as keyof typeof EVENT_STATUS_LABELS] ?? key,
          value,
        }))
        .filter((d) => d.value > 0)
    : [];

  return (
    <div>

      {error && <p className="text-sm text-danger mb-3">{error}</p>}

      <TeamOverview />
      {!summary ? (
        <p className="text-sm text-label-3">読み込み中...</p>
      ) : (
        <div className="space-y-6">
          <MetricCards
            taskTotal={summary.tasks.total}
            taskCompletionRate={summary.tasks.completion_rate}
            taskOverdueCount={summary.tasks.overdue_count}
            eventUpcomingCount={summary.events.upcoming_count}
          />

          <section className="rounded-2xl bg-card p-4">
            <h2 className="mb-3 text-[15px] font-semibold">タスクの状態</h2>
            <EmptyOrChart hasData={summary.tasks.total > 0}>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={taskStatusData}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 16px rgba(0,0,0,.12)" }} />
                  <Bar dataKey="value" fill={BAR_COLOR} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </EmptyOrChart>
          </section>

          <section className="rounded-2xl bg-card p-4">
            <h2 className="mb-3 text-[15px] font-semibold">分類ごとのタスク数</h2>
            <EmptyOrChart hasData={taskDomainData.length > 0}>
              <ResponsiveContainer width="100%" height={Math.max(240, taskDomainData.length * 40)}>
                <BarChart data={taskDomainData} layout="vertical">
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={90}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 16px rgba(0,0,0,.12)" }} />
                  <Bar dataKey="value" fill={BAR_COLOR} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </EmptyOrChart>
          </section>

          <section className="rounded-2xl bg-card p-4">
            <h2 className="mb-3 text-[15px] font-semibold">イベントの状態</h2>
            <EmptyOrChart hasData={eventStatusData.length > 0}>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={eventStatusData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    innerRadius={50}
                    paddingAngle={2}
                    isAnimationActive={false}
                    label
                  >
                    {eventStatusData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 16px rgba(0,0,0,.12)" }} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </EmptyOrChart>
          </section>
        </div>
      )}
    </div>
  );
}
