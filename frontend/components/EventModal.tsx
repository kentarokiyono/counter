"use client";

import { useEffect, useState } from "react";
import { useMembers } from "@/hooks/useMembers";
import Sheet from "@/components/ui/Sheet";
import { Field } from "@/components/ui/Grouped";
import { ChecklistTemplate, listTemplates, saveTemplate } from "@/lib/eventApi";
import { ChecklistItem, EventCreateInput } from "@/lib/eventTypes";

interface EventModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: EventCreateInput) => Promise<void>;
}

export default function EventModal({ open, onClose, onSubmit }: EventModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [assigneesText, setAssigneesText] = useState("");
  const { members } = useMembers();
  const currentAssignees = assigneesText
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  function toggleAssignee(name: string) {
    const next = currentAssignees.includes(name)
      ? currentAssignees.filter((n) => n !== name)
      : [...currentAssignees, name];
    setAssigneesText(next.join(", "));
  }
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newChecklistItem, setNewChecklistItem] = useState("");
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);

  useEffect(() => {
    if (open) listTemplates().then(setTemplates).catch(() => setTemplates([]));
  }, [open]);

  function applyTemplate(t: ChecklistTemplate) {
    setChecklist((prev) => {
      const have = new Set(prev.map((c) => c.item));
      return [...prev, ...t.items.filter((i) => !have.has(i)).map((item) => ({ item, done: false }))];
    });
  }

  async function saveAsTemplate() {
    if (checklist.length === 0) return;
    const name = window.prompt("テンプレートの名前（同じ名前は上書き）", title.trim() || "");
    if (!name?.trim()) return;
    try {
      const t = await saveTemplate(name.trim(), checklist.map((c) => c.item));
      setTemplates((prev) => [...prev.filter((x) => x.id !== t.id && x.name !== t.name), t]);
    } catch {
      setError("テンプレートを保存できませんでした");
    }
  }
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    resetForm();
    onClose();
  }

  function resetForm() {
    setTitle("");
    setDescription("");
    setLocation("");
    setStartTime("");
    setEndTime("");
    setAssigneesText("");
    setChecklist([]);
    setNewChecklistItem("");
    setError(null);
  }

  function addChecklistItem() {
    const text = newChecklistItem.trim();
    if (!text) return;
    setChecklist((prev) => [...prev, { item: text, done: false }]);
    setNewChecklistItem("");
  }

  function removeChecklistItem(index: number) {
    setChecklist((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("タイトルは必須です");
      return;
    }
    if (!startTime) {
      setError("開始日時は必須です");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const assignees = assigneesText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      await onSubmit({
        title: title.trim(),
        description: description.trim() || undefined,
        location: location.trim() || undefined,
        start_time: new Date(startTime).toISOString(),
        end_time: endTime ? new Date(endTime).toISOString() : undefined,
        assignees,
        checklist,
      });
      resetForm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "作成に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      locked={submitting}
      title="新規イベント"
      leading={
        <button type="button" className="ios-btn-plain" onClick={close} disabled={submitting}>
          キャンセル
        </button>
      }
      trailing={
        <button type="submit" form="event-form" className="ios-btn-plain font-semibold" disabled={submitting}>
          {submitting ? "作成中" : "追加"}
        </button>
      }
    >
      <form id="event-form" onSubmit={handleSubmit} className="space-y-4">
        <Field label="タイトル" required>
          <input
            className="ios-input bg-card"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="開始日時" required>
            <input
              type="datetime-local"
              className="ios-input bg-card"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </Field>
          <Field label="終了日時">
            <input
              type="datetime-local"
              className="ios-input bg-card"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </Field>
        </div>
        <Field label="場所">
          <input
            className="ios-input bg-card"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="例: 田辺市 テストコース"
          />
        </Field>
        <Field label="詳細">
          <textarea
            className="ios-input bg-card"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        <div>
          <span className="mb-1 block px-1 text-[13px] text-label-2">担当者</span>
          <div className="flex flex-wrap gap-1.5">
            {members.map((m) => {
              const on = currentAssignees.includes(m.name);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleAssignee(m.name)}
                  aria-pressed={on}
                  className={`rounded-full px-3 py-1.5 text-[14px] ${
                    on ? "bg-accent-soft text-accent-ink" : "bg-card text-label"
                  }`}
                >
                  {m.name}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-[13px] text-label-2">持ち物・準備チェックリスト</span>
            {checklist.length > 0 && (
              <button type="button" className="ios-btn-plain text-[13px]" onClick={saveAsTemplate}>
                テンプレートに保存
              </button>
            )}
          </div>
          {templates.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => applyTemplate(t)}
                  className="rounded-full bg-card px-3 py-1 text-[13px] text-accent"
                  title={t.items.join("、")}
                >
                  ＋{t.name}
                </button>
              ))}
            </div>
          )}
          <div className="overflow-hidden rounded-xl bg-card [&>*+*]:border-t [&>*+*]:border-separator">
            {checklist.map((c, i) => (
              <div key={i} className="flex min-h-[44px] items-center gap-3 px-4">
                <button
                  type="button"
                  aria-label={`${c.item}を削除`}
                  onClick={() => removeChecklistItem(i)}
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-p-red text-p-red-ink"
                >
                  <span className="block h-0.5 w-2.5 bg-current" />
                </button>
                <span className="flex-1 text-[15px]">{c.item}</span>
              </div>
            ))}
            <div className="flex min-h-[44px] items-center gap-3 px-4">
              <button
                type="button"
                aria-label="項目を追加"
                onClick={addChecklistItem}
                className="flex h-5 w-5 items-center justify-center rounded-full bg-p-green text-[15px] font-bold leading-none text-p-green-ink"
              >
                +
              </button>
              <input
                className="flex-1 bg-transparent py-2 text-[15px] outline-hidden placeholder:text-label-3"
                value={newChecklistItem}
                onChange={(e) => setNewChecklistItem(e.target.value)}
                placeholder="項目を追加（例: テント）"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    addChecklistItem();
                  }
                }}
              />
            </div>
          </div>
        </div>

        {error && <p className="px-1 text-[13px] text-danger">{error}</p>}
      </form>
    </Sheet>
  );
}
