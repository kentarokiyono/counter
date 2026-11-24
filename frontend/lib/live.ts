// バックエンドからのリアルタイム更新（/api/realtime/stream）を全画面で1本の接続で共有する。
import { API_BASE, openTicketedStream } from "./auth";

export type LiveEvent = "INSERT" | "UPDATE" | "DELETE";
type Handler = (event: LiveEvent, row: Record<string, unknown>) => void;

const handlers = new Map<string, Set<Handler>>();
const resyncHandlers = new Set<() => void>();
let close: (() => void) | null = null;

function ensureConnected() {
  if (close || typeof window === "undefined") return;
  close = openTicketedStream(`${API_BASE}/api/realtime/stream`, {
    onMessage: (data) => {
      try {
        const msg = JSON.parse(data) as { table: string; event: LiveEvent; row: Record<string, unknown> };
        handlers.get(msg.table)?.forEach((h) => h(msg.event, msg.row));
      } catch {
        // 不正なメッセージは無視
      }
    },
    // 切断中の更新は届かないので、再接続時に各画面へ再取得を促す
    onReconnect: () => resyncHandlers.forEach((h) => h()),
  });
}

function maybeDisconnect() {
  const active = [...handlers.values()].some((s) => s.size > 0) || resyncHandlers.size > 0;
  if (!active && close) {
    close();
    close = null;
  }
}

/** table の変更を購読する。戻り値で購読解除。resync は再接続時に呼ばれる。 */
export function subscribeLive(table: string, handler: Handler, resync?: () => void): () => void {
  if (!handlers.has(table)) handlers.set(table, new Set());
  handlers.get(table)!.add(handler);
  if (resync) resyncHandlers.add(resync);
  ensureConnected();
  return () => {
    handlers.get(table)?.delete(handler);
    if (resync) resyncHandlers.delete(resync);
    // 画面遷移直後の再購読で接続を張り直さないよう、少し待ってから判断する
    window.setTimeout(maybeDisconnect, 2000);
  };
}

/** 一覧stateに INSERT/UPDATE/DELETE を反映する共通処理 */
export function applyLive<T extends { id: string }>(
  prev: T[],
  event: LiveEvent,
  row: Record<string, unknown>,
  insertAt: "start" | "end" = "start"
): T[] {
  const id = String(row.id);
  if (event === "DELETE") return prev.filter((x) => x.id !== id);
  const item = row as unknown as T;
  if (prev.some((x) => x.id === id)) return prev.map((x) => (x.id === id ? item : x));
  if (event === "UPDATE") return prev; // 一覧に無い（絞り込み外など）ものは追加しない
  return insertAt === "start" ? [item, ...prev] : [...prev, item];
}
