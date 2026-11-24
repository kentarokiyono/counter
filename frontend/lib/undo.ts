import { restoreTrash } from "./homeApi";

/** 削除通知の「元に戻す」。ゴミ箱から復元し、一覧へはリアルタイム配信で戻る。 */
export function undoDelete(
  kind: "tasks" | "events" | "test_runs" | "sticker_surveys",
  id: string,
  onDone?: (ok: boolean) => void
) {
  return {
    label: "元に戻す",
    onClick: () => {
      restoreTrash(kind, id)
        .then(() => onDone?.(true))
        .catch(() => onDone?.(false));
    },
  };
}
