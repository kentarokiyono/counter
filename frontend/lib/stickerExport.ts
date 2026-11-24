// シール集計の書き出し（CSV・PDF）。外部サービスには送らず、手元に保存する。
import { API_BASE } from "./auth";
import { safeFileName, saveFile } from "./saveFile";
import { COLOR_HEX, Grid, PREFS, Survey, colorTotal, csvPath, grandTotal, prefTotal } from "./stickersApi";

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/** CSV（サーバーで作る。Excel で文字化けしない BOM 付き） */
export function saveStickerCsv(survey: Survey, includeZero: boolean) {
  return saveFile(
    `${safeFileName(survey.title, "シール集計")}_${stamp()}.csv`,
    { description: "CSV（Excel）", accept: { "text/csv": [".csv"] } },
    async () => {
      const res = await fetch(`${API_BASE}${csvPath(survey.id, includeZero)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`書き出せませんでした（HTTP ${res.status}）`);
      return res.blob();
    }
  );
}

// ---------------------------------------------------------------------------
// PDF
// jsPDF の標準フォントは日本語を持たないため、日本語の文字は画面のフォントで画像にして貼る。
// ---------------------------------------------------------------------------
const FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", "Meiryo", sans-serif';
const SCALE = 4; // 画像の解像度（印刷でもにじまないように）

interface TextImage {
  url: string;
  /** PDF 内で同じ画像を使い回すための名前 */
  alias: string;
  /** 高さ1あたりの幅 */
  ratio: number;
}

const cache = new Map<string, TextImage>();

function textImage(text: string, bold = false, color = "#111111"): TextImage {
  const key = `${bold}|${color}|${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const px = 12 * SCALE;
  const font = `${bold ? "700" : "400"} ${px}px ${FONT}`;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = font;
  const w = Math.max(1, Math.ceil(ctx.measureText(text).width));
  const h = Math.ceil(px * 1.3);
  canvas.width = w;
  canvas.height = h;
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, 0, h / 2);
  const img = { url: canvas.toDataURL("image/png"), alias: `t${cache.size}`, ratio: w / h };
  cache.set(key, img);
  return img;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

async function logoDataUrl(): Promise<string | null> {
  try {
    const blob = await (await fetch("/toloc-logo.png")).blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(typeof r.result === "string" ? r.result : null);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function saveStickerPdf(survey: Survey, grid: Grid, includeZero: boolean) {
  const name = `${safeFileName(survey.title, "シール集計")}_${stamp()}.pdf`;
  return saveFile(name, { description: "PDF", accept: { "application/pdf": [".pdf"] } }, async () => {
    const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
    const colors = survey.colors;

    // 見出し
    // ロゴ（右上）に重ならないよう、長い文字は縮める
    const put = (text: string, x: number, y: number, h: number, bold = false, color?: string) => {
      const img = textImage(text, bold, color);
      const maxW = 158;
      const w = Math.min(h * img.ratio, maxW);
      const hh = w / img.ratio;
      doc.addImage(img.url, "PNG", x, y + (h - hh) / 2, w, hh, img.alias, "FAST");
    };
    const logo = await logoDataUrl();
    if (logo) doc.addImage(logo, "PNG", 176, 8, 20, 20, "toloc-logo", "FAST");
    put(survey.title, 14, 10, 7, true);
    const meta = [survey.survey_date, survey.location, `合計 ${grandTotal(grid).toLocaleString()}枚`].filter(Boolean).join("　");
    put(meta, 14, 19, 4.2, false, "#555555");
    put(`出力 ${new Date().toLocaleString("ja-JP")}　Toloc OS`, 14, 24.5, 3.4, false, "#888888");

    // 表。日本語のセルは文字を消して、描画後に画像を置く
    const head = [["都道府県", ...colors.map((c) => c.label), "計"]];
    const body: (string | number)[][] = [];
    for (const p of PREFS) {
      const total = prefTotal(grid, p);
      if (!includeZero && total === 0) continue;
      body.push([p, ...colors.map((c) => grid[p]?.[c.key] ?? 0), total]);
    }
    const foot = [["合計", ...colors.map((c) => colorTotal(grid, c.key)), grandTotal(grid)]];
    const textH = 3.3;

    autoTable(doc, {
      head,
      body,
      foot,
      startY: 30,
      theme: "grid",
      styles: { font: "helvetica", fontSize: 9, halign: "center", valign: "middle", cellPadding: 1.6, minCellHeight: 6.5 },
      headStyles: { fillColor: [242, 242, 247], textColor: [17, 17, 17], lineColor: [200, 200, 205] },
      footStyles: { fillColor: [220, 241, 237], textColor: [17, 17, 17], fontStyle: "bold" },
      bodyStyles: { lineColor: [220, 220, 225] },
      columnStyles: { 0: { cellWidth: 32, halign: "left" } },
      didParseCell: (data) => {
        const isText = data.column.index === 0 || data.section === "head";
        if (isText) {
          (data.cell as unknown as { _label: string })._label = String(data.cell.raw ?? "");
          data.cell.text = [""];
        }
        if (data.section === "body" && data.column.index > 0 && data.cell.raw === 0) {
          data.cell.styles.textColor = [190, 190, 195];
        }
      },
      didDrawCell: (data) => {
        const label = (data.cell as unknown as { _label?: string })._label;
        if (!label) return;
        const bold = data.section !== "body";
        const img = textImage(label, bold);
        let w = textH * img.ratio;
        let h = textH;
        const maxW = data.cell.width - 2.4 - (data.section === "head" && data.column.index > 0 && data.column.index <= colors.length ? 3.2 : 0);
        if (w > maxW) {
          h = (h * maxW) / w;
          w = maxW;
        }
        const y = data.cell.y + (data.cell.height - h) / 2;
        const colorIdx = data.column.index - 1;
        if (data.section === "head" && colorIdx >= 0 && colorIdx < colors.length) {
          // 色の見本の丸 + ラベル
          const sw = 2.4;
          const total = sw + 0.8 + w;
          const x0 = data.cell.x + (data.cell.width - total) / 2;
          doc.setFillColor(...hexToRgb(COLOR_HEX[colors[colorIdx].key]));
          doc.circle(x0 + sw / 2, data.cell.y + data.cell.height / 2, sw / 2, "F");
          doc.addImage(img.url, "PNG", x0 + sw + 0.8, y, w, h, img.alias, "FAST");
          return;
        }
        const x = data.column.index === 0 ? data.cell.x + 1.6 : data.cell.x + (data.cell.width - w) / 2;
        doc.addImage(img.url, "PNG", x, y, w, h, img.alias, "FAST");
      },
    });
    return doc.output("blob");
  });
}
