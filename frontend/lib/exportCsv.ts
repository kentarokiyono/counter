import { API_BASE } from "./auth";
import { SaveResult, saveFile } from "./saveFile";

/** CSV を保存する（保存先を選べる環境では選ばせる。中身はログイン情報付きで取得する） */
export function downloadCsv(kind: "tasks" | "events"): Promise<SaveResult> {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return saveFile(`${kind}_${stamp}.csv`, { description: "CSV（Excel）", accept: { "text/csv": [".csv"] } }, async () => {
    const res = await fetch(`${API_BASE}/api/export/${kind}.csv`, { cache: "no-store" });
    if (!res.ok) throw new Error(`書き出せませんでした（HTTP ${res.status}）`);
    return res.blob();
  });
}
