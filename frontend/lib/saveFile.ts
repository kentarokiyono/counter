// ファイルの保存。対応しているブラウザ（PCのChrome・Edge、Windows版）では保存先と名前を選ぶ画面を出す。
// 対応していない環境（スマホ・Safari・Firefox）では従来どおりダウンロードフォルダに保存する。

export type SaveResult = "saved" | "downloaded" | "cancelled";

interface FileType {
  description: string;
  accept: Record<string, string[]>;
}

type Picker = (opts: { suggestedName: string; types: FileType[] }) => Promise<{
  createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
}>;

function picker(): Picker | null {
  const fn = (window as unknown as { showSaveFilePicker?: Picker }).showSaveFilePicker;
  // 別のページに埋め込まれていると使えない
  return typeof fn === "function" && window.self === window.top ? fn.bind(window) : null;
}

function download(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 保存先を選ばせてから中身を用意して書き込む。
 * 保存画面はボタンを押した直後にしか開けないため、中身の取得（通信など）は保存先を決めた後に行う。
 */
export async function saveFile(name: string, type: FileType, content: () => Promise<Blob> | Blob): Promise<SaveResult> {
  const pick = picker();
  if (!pick) {
    download(name, await content());
    return "downloaded";
  }
  let handle;
  try {
    handle = await pick({ suggestedName: name, types: [type] });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
    // 保存画面を開けない環境では従来どおり
    download(name, await content());
    return "downloaded";
  }
  const blob = await content();
  const w = await handle.createWritable();
  await w.write(blob);
  await w.close();
  return "saved";
}

export function safeFileName(name: string, fallback: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim() || fallback;
}
