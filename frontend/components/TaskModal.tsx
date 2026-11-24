"use client";

import { useEffect, useState } from "react";
import Sheet from "@/components/ui/Sheet";
import Segmented from "@/components/ui/Segmented";
import { Field, Group, Row } from "@/components/ui/Grouped";
import TaskComments from "@/components/TaskComments";
import {
  Task,
  TaskCreateInput,
  TaskDomain,
  TaskStatus,
  TaskChecklistItem,
  TaskRepeat,
  TASK_REPEAT_LABELS,
  TaskUpdateInput,
  TASK_DOMAIN_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUS_ORDER,
} from "@/lib/types";
import { useMembers } from "@/hooks/useMembers";
import { useSelf } from "@/lib/self";
import { confirmDelete } from "@/lib/confirmDelete";

interface TaskModalProps {
  open: boolean;
  onClose: () => void;
  /** 指定時は編集モード。未指定なら新規作成 */
  task?: Task | null;
  /** 新規作成時の初期ステータス（列の「+」から開いた場合など） */
  initialStatus?: TaskStatus;
  onCreate?: (input: TaskCreateInput) => Promise<void>;
  onUpdate?: (taskId: string, input: TaskUpdateInput) => Promise<void>;
  onDelete?: (task: Task) => Promise<void>;
}

const DOMAIN_OPTIONS = Object.entries(TASK_DOMAIN_LABELS) as [
  TaskDomain,
  string
][];

export default function TaskModal({
  open,
  onClose,
  task,
  initialStatus,
  onCreate,
  onUpdate,
  onDelete,
}: TaskModalProps) {
  const { members } = useMembers();
  const self = useSelf();
  const isEdit = !!task;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeName, setAssigneeName] = useState("");
  const [domain, setDomain] = useState<TaskDomain | "">("");
  const [dueDate, setDueDate] = useState("");
  const [repeat, setRepeat] = useState<TaskRepeat | "">("");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [checklist, setChecklist] = useState<TaskChecklistItem[]>([]);
  const [newItem, setNewItem] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 開くたびにフォームを対象タスク（または空）で初期化する
  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setAssigneeName(task?.assignee_name ?? "");
    setDomain(task?.domain ?? "");
    setDueDate(task?.due_date ?? "");
    setRepeat(task?.repeat ?? "");
    setStatus(task?.status ?? initialStatus ?? "todo");
    setChecklist(task?.checklist ?? []);
    setNewItem("");
    setError(null);
    setSubmitting(false);
    // 編集中に他メンバーの更新で入力が消えないよう、開いた時と対象が変わった時だけ初期化する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id, initialStatus]);


  // 既存タスクの担当者がメンバー一覧に無い場合も選択肢に残す（旧データの手入力名）
  const memberNames = members.map((m) => m.name);
  const assigneeOptions =
    assigneeName && !memberNames.includes(assigneeName)
      ? [assigneeName, ...memberNames]
      : memberNames;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("タイトルは必須です");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (isEdit && task && onUpdate) {
        await onUpdate(task.id, {
          title: title.trim(),
          description: description.trim() || null,
          assignee_name: assigneeName || null,
          domain: domain || null,
          due_date: dueDate || null,
          status,
          checklist,
          // 変えたときだけ送る
          ...(repeat !== (task.repeat ?? "") ? { repeat: repeat || null } : {}),
        });
      } else if (onCreate) {
        await onCreate({
          title: title.trim(),
          description: description.trim() || undefined,
          assignee_name: assigneeName || undefined,
          domain: domain || undefined,
          due_date: dueDate || undefined,
          status,
          checklist,
          ...(repeat ? { repeat } : {}),
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!task || !onDelete) return;
    if (!confirmDelete(task.title)) return;
    setSubmitting(true);
    setError(null);
    try {
      await onDelete(task);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
      setSubmitting(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      locked={submitting}
      title={isEdit ? "タスクを編集" : "新規タスク"}
      leading={
        <button type="button" className="ios-btn-plain" onClick={onClose} disabled={submitting}>
          キャンセル
        </button>
      }
      trailing={
        <button type="submit" form="task-form" className="ios-btn-plain font-semibold" disabled={submitting}>
          {submitting ? "保存中" : isEdit ? "保存" : "追加"}
        </button>
      }
    >
      <form id="task-form" onSubmit={handleSubmit} className="space-y-4">
        <Field label="タイトル" required>
          <input
            className="ios-input bg-card"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            autoFocus={!isEdit}
          />
        </Field>

        <Field label="状態" group>
          <Segmented<TaskStatus>
            className="w-full"
            value={status}
            onChange={setStatus}
            options={TASK_STATUS_ORDER.map((s) => ({ value: s, label: TASK_STATUS_LABELS[s] }))}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="担当者">
            <select
              className="ios-input bg-card"
              value={assigneeName}
              onChange={(e) => setAssigneeName(e.target.value)}
            >
              <option value="">未割当</option>
              {assigneeOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                  {name === self ? "（自分）" : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="期限">
            <input
              type="date"
              className="ios-input bg-card"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </Field>
          <Field label="繰り返し">
            <select
              className="ios-input bg-card"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value as TaskRepeat | "")}
            >
              <option value="">しない</option>
              {(Object.keys(TASK_REPEAT_LABELS) as TaskRepeat[]).map((r) => (
                <option key={r} value={r}>
                  {TASK_REPEAT_LABELS[r]}（完了で次を作成）
                </option>
              ))}
            </select>
          </Field>
        </div>
        {self && assigneeName !== self && (
          <button type="button" className="ios-btn-plain -mt-2 px-1 text-[13px]" onClick={() => setAssigneeName(self)}>
            自分を担当にする
          </button>
        )}

        <Field label="分類">
          <select
            className="ios-input bg-card"
            value={domain}
            onChange={(e) => setDomain(e.target.value as TaskDomain | "")}
          >
            <option value="">未分類</option>
            {DOMAIN_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="詳細">
          <textarea
            className="ios-input bg-card"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        <div>
          <span className="mb-1 block px-1 text-[13px] text-label-2">
            チェック項目
            {checklist.length > 0 && ` ${checklist.filter((c) => c.done).length}/${checklist.length}`}
          </span>
          <div className="overflow-hidden rounded-xl bg-card [&>*+*]:border-t [&>*+*]:border-separator">
            {checklist.map((c, i) => (
              <div key={i} className="flex min-h-[44px] items-center gap-3 px-3">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={c.done}
                  onClick={() => setChecklist((p) => p.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))}
                  className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 ${
                    c.done ? "border-accent bg-accent-soft text-accent-ink" : "border-label-3"
                  }`}
                >
                  {c.done && (
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m5 12 5 5 9-10" />
                    </svg>
                  )}
                </button>
                <span className={`flex-1 text-[15px] ${c.done ? "text-label-3 line-through" : ""}`}>{c.item}</span>
                <button
                  type="button"
                  aria-label={`${c.item}を削除`}
                  onClick={() => setChecklist((p) => p.filter((_, j) => j !== i))}
                  className="text-[18px] leading-none text-label-3"
                >
                  ×
                </button>
              </div>
            ))}
            <div className="flex min-h-[44px] items-center gap-3 px-3">
              <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center text-[18px] text-accent">＋</span>
              <input
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                placeholder="項目を追加"
                className="flex-1 bg-transparent py-2 text-[15px] outline-hidden placeholder:text-label-3"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    if (newItem.trim()) {
                      setChecklist((p) => [...p, { item: newItem.trim(), done: false }]);
                      setNewItem("");
                    }
                  }
                }}
              />
            </div>
          </div>
        </div>

        {isEdit && task && <TaskComments taskId={task.id} />}

        {error && <p className="px-1 text-[13px] text-danger">{error}</p>}

        {isEdit && onDelete && (
          <Group className="mb-0! pt-2">
            <Row destructive onClick={handleDelete}>
              タスクを削除
            </Row>
          </Group>
        )}
      </form>
    </Sheet>
  );
}
