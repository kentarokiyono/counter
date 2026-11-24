// 活動ログの書き出し（CSV・Markdown）。外部サービスには送らず、手元に保存する。
import { RunLog, TEAMS, TEAM_NAME, TestRun, Work, fmtDur, hm, workSeconds } from "./testRunApi";
import { safeFileName, saveFile } from "./saveFile";

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ja-JP") : "");

export function workCsv(work: Work[], now: number): string {
  return toCsv(
    ["区分", "作業", "開始", "終了", "時間（分）", "記録者"],
    work.map((w) => [TEAM_NAME[w.team], w.task, dt(w.started_at), dt(w.ended_at), Math.round(workSeconds(w, now) / 60), w.created_by])
  );
}

export function logsCsv(logs: RunLog[]): string {
  return toCsv(
    ["時刻", "分類", "内容", "詳細", "記録者"],
    [...logs].reverse().map((l) => [dt(l.created_at), l.category, l.title, l.details, l.actor])
  );
}

export function markdownReport(run: TestRun, work: Work[], logs: RunLog[], now: number): string {
  const md: string[] = [
    `# ${run.title}`,
    "",
    `- 日付: ${run.run_date ?? "未設定"}`,
    `- 場所: ${run.location ?? "未設定"}`,
    "",
    "## 区分ごとの作業時間",
    "",
    "| 区分 | 合計 | 件数 |",
    "| --- | ---: | ---: |",
  ];
  for (const t of TEAMS) {
    const mine = work.filter((w) => w.team === t.key);
    md.push(`| ${t.name} | ${fmtDur(mine.reduce((s, w) => s + workSeconds(w, now), 0))} | ${mine.length} |`);
  }
  md.push("", "## 作業", "");
  if (work.length) {
    md.push("| 区分 | 作業 | 開始 | 終了 | 時間 |", "| --- | --- | --- | --- | ---: |");
    for (const w of work)
      md.push(`| ${TEAM_NAME[w.team]} | ${w.task} | ${hm(w.started_at)} | ${w.ended_at ? hm(w.ended_at) : "作業中"} | ${fmtDur(workSeconds(w, now))} |`);
  } else {
    md.push("記録なし");
  }
  md.push("", "## 記録", "");
  for (const l of [...logs].reverse()) md.push(`- ${hm(l.created_at)} [${l.category}] ${l.title}${l.details ? ` — ${l.details}` : ""}`);
  return md.join("\n") + "\n";
}

export function saveCsv(runTitle: string, kind: string, csv: string) {
  return saveFile(
    `${safeFileName(runTitle, "活動ログ")}_${kind}.csv`,
    { description: "CSV（Excel）", accept: { "text/csv": [".csv"] } },
    () => new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" })
  );
}

export function saveMarkdown(runTitle: string, md: string) {
  return saveFile(
    `${safeFileName(runTitle, "活動ログ")}_レポート.md`,
    { description: "Markdown", accept: { "text/markdown": [".md"] } },
    () => new Blob(["﻿", md], { type: "text/markdown;charset=utf-8" })
  );
}
