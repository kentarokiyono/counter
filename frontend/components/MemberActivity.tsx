"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ActivitySummary,
  MemberStat,
  fetchActivitySummary,
} from "@/lib/activityApi";
import {
  TASK_DOMAIN_LABELS,
  TASK_STATUS_LABELS,
  TaskDomain,
  TaskStatus,
} from "@/lib/types";

const DOMAIN_COLORS: Record<TaskDomain, string> = {
  planning: "#c6baee",
  pr: "#e6a3e8",
  liaison: "#f2c98f",
  fieldwork: "#a3d6b8",
  survey: "#bde3e6",
  admin: "#a9d3ee",
};
const DOMAIN_KEYS = Object.keys(TASK_DOMAIN_LABELS) as TaskDomain[];

function fmtDuration(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 1) return "0分";
  if (m < 60) return `${m}分`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? `${h}時間${mm}分` : `${h}時間`;
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ja-JP", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function statusLabel(s: string): string {
  return TASK_STATUS_LABELS[s as TaskStatus] ?? s;
}

const STATUS_TONE: Record<string, string> = {
  todo: "bg-fill text-label-2",
  in_progress: "bg-p-orange text-p-orange-ink",
  review: "bg-p-blue text-p-blue-ink",
  done: "bg-p-green text-p-green-ink",
};

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-card p-4">
      {children}
    </section>
  );
}

export default function MemberActivity() {
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await fetchActivitySummary();
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
    const interval = setInterval(load, 30000); // 30秒ごと更新
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // データがある業務区分だけを積み上げ棒に出す（フィールド欠落にも耐える）
  const memberDomains = summary?.member_domains ?? [];
  const dailyActivity = summary?.daily_activity ?? [];
  const dailyCompletions = summary?.daily_completions ?? [];
  const activeDomains = DOMAIN_KEYS.filter((d) =>
    memberDomains.some((r) => (r[d] ?? 0) > 0)
  );

  return (
    <div>

      {error && (
        <div className="mb-4 rounded-lg bg-p-orange px-4 py-3 text-sm text-p-orange-ink">
          読み込めませんでした（{error}）
        </div>
      )}

      {!summary && !error && (
        <p className="text-sm text-label-3">読み込み中...</p>
      )}

      {summary && (
        <div className="space-y-6">
          {/* 現在オンライン */}
          <Card>
            <h2 className="mb-3 text-[15px] font-semibold text-label">
              現在オンライン{" "}
              <span className="text-label-3">({summary.online.length})</span>
            </h2>
            {summary.online.length === 0 ? (
              <p className="text-sm text-label-3">
                現在オンラインのメンバーはいません。
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {summary.online.map((m) => (
                  <span
                    key={m.name}
                    className="inline-flex items-center gap-2 rounded-full bg-p-green px-3 py-1 text-sm text-p-green-ink"
                  >
                    <span className="h-2 w-2 rounded-full bg-(--p-green-bar)" />
                    {m.name}
                    <span className="text-xs text-p-green-ink">
                      {fmtDuration(m.session_seconds)}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </Card>

          {/* 日別トレンド（稼働時間・完了数） */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Card>
              <h2 className="mb-3 text-[15px] font-semibold text-label">
                日別の稼働時間（分・直近7日）
              </h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={dailyActivity}>
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} width={32} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => [`${v}分`, "稼働"]} />
                  <Bar
                    dataKey="minutes"
                    fill="#f2c98f"
                    radius={[3, 3, 0, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </Card>
            <Card>
              <h2 className="mb-3 text-[15px] font-semibold text-label">
                タスク完了の推移（件・直近7日）
              </h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={dailyCompletions}>
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} width={32} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => [`${v}件`, "完了"]} />
                  <Bar
                    dataKey="count"
                    fill="#a9d3ee"
                    radius={[3, 3, 0, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* メンバー別サマリー */}
          <Card>
            <h2 className="mb-3 text-[15px] font-semibold text-label">
              メンバー別サマリー
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-label-3">
                    <th className="pb-2 font-medium">メンバー</th>
                    <th className="pb-2 font-medium">稼働（今日）</th>
                    <th className="pb-2 font-medium">稼働（7日）</th>
                    <th className="pb-2 font-medium">完了</th>
                    <th className="pb-2 font-medium">進行中</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.members.map((m: MemberStat) => (
                    <tr key={m.name} className="border-t border-separator">
                      <td className="py-2">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className={`h-2 w-2 rounded-full ${m.online ? "bg-(--p-green-bar)" : "bg-separator"}`}
                          />
                          {m.name}
                        </span>
                      </td>
                      <td className="py-2 text-label-2">
                        {fmtDuration(m.active_seconds_today)}
                      </td>
                      <td className="py-2 text-label-2">
                        {fmtDuration(m.active_seconds_7d)}
                      </td>
                      <td className="py-2 text-label-2">{m.completed_tasks}</td>
                      <td className="py-2 text-label-2">
                        {m.in_progress_tasks}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* メンバー別 業務区分内訳 */}
          <Card>
            <h2 className="mb-3 text-[15px] font-semibold text-label">
              メンバーごとの分類
            </h2>
            {activeDomains.length === 0 ? (
              <p className="py-6 text-center text-sm text-label-3">
                分類付きのタスクはまだありません
              </p>
            ) : (
              <ResponsiveContainer
                width="100%"
                height={Math.max(180, memberDomains.length * 44)}
              >
                <BarChart data={memberDomains} layout="vertical">
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={70}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 16px rgba(0,0,0,.12)" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {activeDomains.map((d) => (
                    <Bar
                      key={d}
                      dataKey={d}
                      stackId="domain"
                      name={TASK_DOMAIN_LABELS[d]}
                      fill={DOMAIN_COLORS[d]}
                      isAnimationActive={false}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          {/* 直近アクティビティ */}
          <Card>
            <h2 className="mb-3 text-[15px] font-semibold text-label">
              直近のタスク更新
            </h2>
            {summary.recent.length === 0 ? (
              <p className="text-sm text-label-3">まだ記録がありません。</p>
            ) : (
              <ul className="space-y-2">
                {summary.recent.map((r, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <div className="min-w-0">
                      <span className="font-medium text-label">
                        {r.title}
                      </span>
                      {r.assignee_name && (
                        <span className="ml-2 text-xs text-label-2">
                          {r.assignee_name}
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={`rounded-sm px-2 py-0.5 text-xs ${STATUS_TONE[r.status] ?? "bg-fill text-label-2"}`}
                      >
                        {statusLabel(r.status)}
                      </span>
                      <span className="text-xs text-label-3">
                        {fmtTime(r.updated_at)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
