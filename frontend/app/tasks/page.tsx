"use client";

import { useEffect, useMemo, useState } from "react";
import { undoDelete } from "@/lib/undo";
import ModulePageHeader from "@/components/ModulePageHeader";
import CsvButton from "@/components/CsvButton";
import TaskBoard from "@/components/TaskBoard";
import TaskModal from "@/components/TaskModal";
import { useToast } from "@/components/Toast";
import { useTasks } from "@/hooks/useTasks";
import { useMembers } from "@/hooks/useMembers";
import { useSelf } from "@/lib/self";
import { createTask, deleteTask, updateTask } from "@/lib/api";
import { dueState } from "@/lib/taskUi";
import {
  Task,
  TaskCreateInput,
  TaskDomain,
  TaskStatus,
  TaskUpdateInput,
  TASK_DOMAIN_LABELS,
  TASK_STATUS_LABELS,
} from "@/lib/types";

const FILTER_STORAGE_KEY = "toloc_task_filters";
const UNASSIGNED = "__unassigned__";

interface Filters {
  q: string;
  assignee: string; // "" = 全員 / UNASSIGNED / 名前
  domain: TaskDomain | "";
  dueOnly: boolean; // 期限切れ・間近のみ
  hideDone: boolean;
}

const DEFAULT_FILTERS: Filters = {
  q: "",
  assignee: "",
  domain: "",
  dueOnly: false,
  hideDone: false,
};

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFKC");
}

export default function TasksPage() {
  const { tasks, loading, error, applyLocalUpdate, revertLocalStatus, removeLocal } =
    useTasks();
  const { members } = useMembers();
  const self = useSelf();
  const toast = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [initialStatus, setInitialStatus] = useState<TaskStatus>("todo");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  // 絞り込み条件は端末ごとに記憶する（検索語は残さない）
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FILTER_STORAGE_KEY);
      if (raw) setFilters({ ...DEFAULT_FILTERS, ...JSON.parse(raw), q: "" });
    } catch {
      // noop
    }
  }, []);
  useEffect(() => {
    try {
      const { q: _q, ...rest } = filters;
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(rest));
    } catch {
      // noop
    }
  }, [filters]);

  // ?task=<id> で開かれた場合（検索パレットから）は編集モーダルを開く
  const [deepLinkId, setDeepLinkId] = useState<string | null>(null);
  useEffect(() => {
    setDeepLinkId(new URLSearchParams(window.location.search).get("task"));
  }, []);
  useEffect(() => {
    if (!deepLinkId || loading) return;
    const t = tasks.find((x) => x.id === deepLinkId);
    if (t) openEdit(t);
    setDeepLinkId(null);
    window.history.replaceState(null, "", "/tasks");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkId, loading, tasks]);

  const filtered = useMemo(() => {
    const q = normalize(filters.q.trim());
    return tasks.filter((t) => {
      if (q) {
        const hay = normalize(`${t.title} ${t.description ?? ""} ${t.assignee_name ?? ""}`);
        if (!hay.includes(q)) return false;
      }
      if (filters.assignee === UNASSIGNED) {
        if (t.assignee_name) return false;
      } else if (filters.assignee && t.assignee_name !== filters.assignee) {
        return false;
      }
      if (filters.domain && t.domain !== filters.domain) return false;
      if (filters.dueOnly) {
        const s = dueState(t);
        if (s !== "overdue" && s !== "soon") return false;
      }
      if (filters.hideDone && t.status === "done") return false;
      return true;
    });
  }, [tasks, filters]);

  const overdueCount = useMemo(
    () => tasks.filter((t) => dueState(t) === "overdue").length,
    [tasks]
  );
  const isFiltered =
    !!filters.q || !!filters.assignee || !!filters.domain || filters.dueOnly || filters.hideDone;

  function openCreate(status: TaskStatus = "todo") {
    setEditing(null);
    setInitialStatus(status);
    setModalOpen(true);
  }

  function openEdit(task: Task) {
    setEditing(task);
    setModalOpen(true);
  }

  const [quickTitle, setQuickTitle] = useState("");
  const [adding, setAdding] = useState(false);

  async function quickAdd(e: React.FormEvent) {
    e.preventDefault();
    const title = quickTitle.trim();
    if (!title || adding) return;
    setAdding(true);
    try {
      applyLocalUpdate(await createTask({ title }));
      setQuickTitle("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "追加できませんでした");
    } finally {
      setAdding(false);
    }
  }

  async function handleCreate(input: TaskCreateInput) {
    const created = await createTask(input);
    // Realtimeでも届くが、即時反映のためローカルにも入れる（重複はフック側で抑止）。
    applyLocalUpdate(created);
    toast.success(`「${created.title}」を作成しました`);
  }

  async function handleUpdate(taskId: string, input: TaskUpdateInput) {
    const updated = await updateTask(taskId, input);
    applyLocalUpdate(updated);
    toast.success("保存しました");
  }

  async function handleDelete(task: Task) {
    await deleteTask(task.id);
    removeLocal(task.id);
    toast.success(`「${task.title}」をゴミ箱に移しました`, undoDelete("tasks", task.id));
  }

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
      active ? "bg-accent-soft text-accent-ink" : "bg-card text-label"
    }`;

  return (
    <div>
      <ModulePageHeader
        title="タスク"
        actions={<CsvButton kind="tasks" />}
      />

      {/* タイトルだけで追加（担当・期限などはカードを開いて後から） */}
      <form onSubmit={quickAdd} className="mb-3 flex gap-2">
        <input
          value={quickTitle}
          onChange={(e) => setQuickTitle(e.target.value)}
          placeholder="＋ タスクを追加"
          enterKeyHint="done"
          className="ios-input flex-1 bg-card text-[16px]"
          aria-label="タスクを追加"
        />
        {quickTitle.trim() && (
          <button type="submit" className="ios-btn" disabled={adding}>
            追加
          </button>
        )}
      </form>

      {/* 絞り込み */}
      <div className="mb-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={filters.q}
            onChange={(e) => set("q", e.target.value)}
            placeholder="タイトル・詳細・担当で検索"
            className="ios-input bg-card sm:w-64"
          />
          <select
            value={filters.assignee}
            onChange={(e) => set("assignee", e.target.value)}
            className="rounded-ios bg-card px-3 py-2.5 text-[15px] text-label outline-hidden"
            aria-label="担当者で絞り込み"
          >
            <option value="">担当: 全員</option>
            <option value={UNASSIGNED}>未割当</option>
            {members.map((m) => (
              <option key={m.id} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>
          <select
            value={filters.domain}
            onChange={(e) => set("domain", e.target.value as TaskDomain | "")}
            className="rounded-ios bg-card px-3 py-2.5 text-[15px] text-label outline-hidden"
            aria-label="分類で絞り込み"
          >
            <option value="">分類: すべて</option>
            {(Object.entries(TASK_DOMAIN_LABELS) as [TaskDomain, string][]).map(
              ([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              )
            )}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {self && (
            <button
              type="button"
              className={chip(filters.assignee === self)}
              onClick={() => set("assignee", filters.assignee === self ? "" : self)}
            >
              自分のタスク
            </button>
          )}
          <button
            type="button"
            className={chip(filters.dueOnly)}
            onClick={() => set("dueOnly", !filters.dueOnly)}
          >
            期限切れ・3日以内
            {overdueCount > 0 && (
              <span className="ml-1 rounded-full bg-danger px-1.5 text-[11px] text-white">
                {overdueCount}
              </span>
            )}
          </button>
          <button
            type="button"
            className={chip(filters.hideDone)}
            onClick={() => set("hideDone", !filters.hideDone)}
          >
            {TASK_STATUS_LABELS.done}を隠す
          </button>
          {isFiltered && (
            <>
              <span className="text-xs text-label-2">
                {filtered.length} / {tasks.length} 件
              </span>
              <button
                type="button"
                className="text-xs text-accent underline"
                onClick={() => setFilters(DEFAULT_FILTERS)}
              >
                条件をクリア
              </button>
            </>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-danger mb-3">{error}</p>}
      {loading ? (
        <p className="text-sm text-label-3">読み込み中...</p>
      ) : (
        <TaskBoard
          tasks={filtered}
          onTaskUpdated={applyLocalUpdate}
          onTaskUpdateFailed={(id, status, message) => {
            revertLocalStatus(id, status);
            toast.error(`状態を戻しました: ${message}`);
          }}
          onOpenTask={openEdit}
          onAddToColumn={openCreate}
        />
      )}

      <TaskModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        task={editing}
        initialStatus={initialStatus}
        onCreate={handleCreate}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
      />
    </div>
  );
}
