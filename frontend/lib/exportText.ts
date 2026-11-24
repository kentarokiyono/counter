// 生成した文章を外部サービスに送らず、手元で使うための書き出し。
import { SaveResult, safeFileName, saveFile } from "./saveFile";

/** クリップボードにコピー */
export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

/** テキストファイルとして保存（保存先を選べる環境では選ばせる） */
export function downloadText(filename: string, text: string): Promise<SaveResult> {
  const safe = safeFileName(filename, "書類");
  const name = safe.endsWith(".txt") ? safe : `${safe}.txt`;
  // Windowsのメモ帳でも文字化けしないよう先頭にBOMを付ける
  return saveFile(name, { description: "テキスト", accept: { "text/plain": [".txt"] } }, () =>
    new Blob(["﻿", text], { type: "text/plain;charset=utf-8" })
  );
}
