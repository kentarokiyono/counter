// CSV / タブ区切り（スプレッドシートからのコピー）を行・列に分ける。

/** 文字コードを判定して読む（Googleスプレッドシートは UTF-8、Excel の日本語CSVは Shift_JIS が多い） */
export async function readTextFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("shift_jis").decode(buf);
  }
}

/** 引用符（"..."）内のカンマ・改行・"" に対応した簡易パーサ。タブを含むならタブ区切りとして読む */
export function parseTable(text: string): string[][] {
  const src = text.replace(/\r\n?/g, "\n");
  const firstLine = src.split("\n", 1)[0] ?? "";
  const sep = firstLine.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}
