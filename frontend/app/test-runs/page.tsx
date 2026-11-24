"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ModulePageHeader from "@/components/ModulePageHeader";
import Sheet from "@/components/ui/Sheet";
import { Field, Group, Row } from "@/components/ui/Grouped";
import { useToast } from "@/components/Toast";
import { applyLive, subscribeLive } from "@/lib/live";
import { TestRun, createRun, listRuns } from "@/lib/testRunApi";

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function NewRunSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today());
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setDate(today());
    setLocation("");
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      const run = await createRun({
        title: title.trim(),
        run_date: date || undefined,
        location: location.trim() || undefined,
      });
      onClose();
      router.push(`/test-runs/${run.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "作成できませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="新しい活動ログ"
      leading={
        <button type="button" className="ios-btn-plain" onClick={onClose}>
          キャンセル
        </button>
      }
      trailing={
        <button type="submit" form="new-run" className="ios-btn-plain font-semibold" disabled={busy || !title.trim()}>
          作成
        </button>
      }
    >
      <form id="new-run" onSubmit={submit} className="space-y-4">
        <Field label="名前" required>
          <input className="ios-input bg-card" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例: 道の駅なみえ ブース出展" maxLength={200} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="日付">
            <input type="date" className="ios-input bg-card" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="場所">
            <input className="ios-input bg-card" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="例: 福島県双葉郡浪江町" />
          </Field>
        </div>
      </form>
    </Sheet>
  );
}

export default function TestRunsPage() {
  const [runs, setRuns] = useState<TestRun[] | null>(null);
  const [open, setOpen] = useState(false);
  const toast = useToast();

  useEffect(() => {
    const load = () =>
      listRuns()
        .then(setRuns)
        .catch((err) => {
          toast.error(err instanceof Error ? err.message : "読み込めませんでした");
          setRuns([]);
        });
    load();
    return subscribeLive("test_runs", (ev, row) => setRuns((p) => (p ? applyLive(p, ev, row) : p)), load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = (runs ?? []).filter((r) => r.status === "active");
  const done = (runs ?? []).filter((r) => r.status === "done");
  const row = (r: TestRun) => (
    <Row key={r.id} href={`/test-runs/${r.id}`} chevron>
      <div className="flex items-center gap-2">
        <span className="truncate font-medium">{r.title}</span>
      </div>
      <div className="truncate text-[13px] text-label-2">
        {[r.run_date, r.location].filter(Boolean).join(" · ") || "—"}
      </div>
    </Row>
  );

  return (
    <div className="mx-auto max-w-3xl">
      <ModulePageHeader
        title="活動ログ"
        actions={
          <button type="button" className="ios-btn" onClick={() => setOpen(true)}>
            新しい活動ログ
          </button>
        }
      />
      {runs === null ? (
        <p className="text-[15px] text-label-3">読み込み中...</p>
      ) : runs.length === 0 ? (
        <button type="button" className="ios-btn-gray" onClick={() => setOpen(true)}>
          ＋ 最初の活動ログを作成
        </button>
      ) : (
        <>
          {active.length > 0 && <Group title="進行中">{active.map(row)}</Group>}
          {done.length > 0 && <Group title="終了">{done.map(row)}</Group>}
        </>
      )}
      <NewRunSheet open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
