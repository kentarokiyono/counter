"use client";

import { useEffect, useState } from "react";
import ModulePageHeader from "@/components/ModulePageHeader";
import { Group, Row } from "@/components/ui/Grouped";
import { useToast } from "@/components/Toast";
import { TrashItem, emptyTrash, listTrash, purgeTrash, relativeTime, restoreTrash } from "@/lib/homeApi";
import { useIsAdmin, useSelf } from "@/lib/self";

export default function TrashPage() {
  const toast = useToast();
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const [days, setDays] = useState(30);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [emptying, setEmptying] = useState(false);
  const isAdmin = useIsAdmin();
  const self = useSelf();

  async function load() {
    try {
      const res = await listTrash();
      setItems(res.items);
      setDays(res.retention_days);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "読み込みに失敗しました");
      setItems([]);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function restore(item: TrashItem) {
    setBusyId(item.id);
    try {
      await restoreTrash(item.kind, item.id);
      setItems((prev) => prev?.filter((x) => x.id !== item.id) ?? null);
      toast.success(`「${item.label}」を復元しました`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "復元に失敗しました");
    } finally {
      setBusyId(null);
    }
  }

  async function purge(item: TrashItem) {
    if (!confirm(`「${item.label}」を完全に削除しますか？\nこの操作は元に戻せません。`)) return;
    setBusyId(item.id);
    try {
      await purgeTrash(item.kind, item.id);
      setItems((prev) => prev?.filter((x) => x.id !== item.id) ?? null);
      toast.success(`「${item.label}」を完全に削除しました`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "削除に失敗しました");
    } finally {
      setBusyId(null);
    }
  }

  async function empty() {
    if (!items?.length) return;
    if (!confirm(`ゴミ箱の${items.length}件を完全に削除しますか？\nこの操作は元に戻せません。`)) return;
    setEmptying(true);
    try {
      const res = await emptyTrash();
      setItems([]);
      toast.success(`${res.deleted}件を完全に削除しました`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "削除に失敗しました");
      load();
    } finally {
      setEmptying(false);
    }
  }

  const remaining = (iso: string) => {
    const left = days - Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    return `あと${Math.max(left, 0)}日`;
  };

  return (
    <div className="mx-auto max-w-3xl">
      <ModulePageHeader
        title="ゴミ箱"
        actions={
          isAdmin && items && items.length > 0 ? (
            <button type="button" className="ios-btn-plain font-semibold text-danger" onClick={empty} disabled={emptying}>
              ゴミ箱を空にする
            </button>
          ) : undefined
        }
      />
      {items === null ? (
        <p className="text-[15px] text-label-3">読み込み中...</p>
      ) : (
        <Group>
          {items.length === 0 ? (
            <Row>
              <span className="text-label-2">ゴミ箱は空です</span>
            </Row>
          ) : (
            items.map((i) => (
              <Row
                key={`${i.kind}-${i.id}`}
                detail={
                  <div className="flex items-center gap-3">
                    {(isAdmin || (self && i.deleted_by === self)) && (
                      <button
                        type="button"
                        className="text-[15px] text-danger"
                        onClick={() => purge(i)}
                        disabled={busyId === i.id}
                      >
                        完全削除
                      </button>
                    )}
                    <button
                      type="button"
                      className="ios-btn-plain font-semibold"
                      onClick={() => restore(i)}
                      disabled={busyId === i.id}
                    >
                      復元
                    </button>
                  </div>
                }
              >
                <div className="truncate">
                  <span className="mr-1.5 rounded-sm bg-fill px-1.5 py-0.5 text-[12px] text-label-2">{i.kind_label}</span>
                  {i.label}
                </div>
                <div className="text-[13px] text-label-2">
                  {i.deleted_by ?? "不明"}が{relativeTime(i.deleted_at)}に削除 · {remaining(i.deleted_at)}
                </div>
              </Row>
            ))
          )}
        </Group>
      )}
    </div>
  );
}
