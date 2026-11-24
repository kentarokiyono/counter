// シール集計（色 × 都道府県）。backend/stickers.py と対応させること。
import { getJson, sendJson } from "./http";

export type ColorKey = "red" | "blue" | "yellow" | "green" | "orange" | "purple" | "pink" | "gray";

export interface StickerColor {
  key: ColorKey;
  label: string;
}

export interface Survey {
  id: string;
  title: string;
  survey_date: string | null;
  location: string | null;
  event_id: string | null;
  colors: StickerColor[];
  status: "active" | "done";
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** 一覧のみ: 合計枚数 */
  total?: number;
}

export interface StickerCount {
  id: string;
  survey_id: string;
  pref: string;
  color: ColorKey;
  count: number;
  updated_at?: string;
  /** 数えた操作の目印（tap で送ったもの） */
  tap_id?: string | null;
}

/** シールの色（実物のシールに近い、はっきりした色） */
export const COLOR_HEX: Record<ColorKey, string> = {
  red: "#e0483e",
  blue: "#3e7ce0",
  yellow: "#e8b724",
  green: "#3ea85c",
  orange: "#ef7f2d",
  purple: "#8a5cd1",
  pink: "#e46aa6",
  gray: "#8a8d93",
};
export const COLOR_NAME: Record<ColorKey, string> = {
  red: "赤",
  blue: "青",
  yellow: "黄",
  green: "緑",
  orange: "橙",
  purple: "紫",
  pink: "桃",
  gray: "灰",
};
export const ALL_COLORS = Object.keys(COLOR_HEX) as ColorKey[];
export const DEFAULT_COLORS: StickerColor[] = (["red", "blue", "yellow", "green"] as ColorKey[]).map((key) => ({
  key,
  label: COLOR_NAME[key],
}));

/** 地方ごとの都道府県（ボタンの並び）。最後は海外 */
export const REGIONS: { name: string; prefs: string[] }[] = [
  { name: "北海道・東北", prefs: ["北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県"] },
  { name: "関東", prefs: ["茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県"] },
  { name: "中部", prefs: ["新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県"] },
  { name: "近畿", prefs: ["三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県"] },
  { name: "中国・四国", prefs: ["鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県"] },
  { name: "九州・沖縄", prefs: ["福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"] },
  { name: "海外", prefs: ["海外"] },
];
export const PREFS: string[] = REGIONS.flatMap((r) => r.prefs);

const ROMAJI_LIST = [
  "Hokkaido", "Aomori", "Iwate", "Miyagi", "Akita", "Yamagata", "Fukushima",
  "Ibaraki", "Tochigi", "Gunma", "Saitama", "Chiba", "Tokyo", "Kanagawa",
  "Niigata", "Toyama", "Ishikawa", "Fukui", "Yamanashi", "Nagano", "Gifu", "Shizuoka", "Aichi",
  "Mie", "Shiga", "Kyoto", "Osaka", "Hyogo", "Nara", "Wakayama",
  "Tottori", "Shimane", "Okayama", "Hiroshima", "Yamaguchi", "Tokushima", "Kagawa", "Ehime", "Kochi",
  "Fukuoka", "Saga", "Nagasaki", "Kumamoto", "Oita", "Miyazaki", "Kagoshima", "Okinawa",
  "Overseas",
];
/** PDF（日本語フォントを持たない）用のローマ字表記 */
export const PREF_ROMAJI: Record<string, string> = Object.fromEntries(PREFS.map((p, i) => [p, ROMAJI_LIST[i]]));

/** 表示の短縮名（「県」「府」「都」を外す。北海道・海外はそのまま） */
export function shortPref(p: string): string {
  if (p === "北海道" || p === "海外") return p;
  return p.replace(/[都府県]$/, "");
}

/** counts → grid[pref][color] */
export type Grid = Record<string, Partial<Record<ColorKey, number>>>;
export function toGrid(counts: StickerCount[]): Grid {
  const g: Grid = {};
  for (const c of counts) (g[c.pref] ??= {})[c.color] = c.count;
  return g;
}
export const prefTotal = (g: Grid, pref: string) => Object.values(g[pref] ?? {}).reduce((s, n) => s + (n ?? 0), 0);
export const colorTotal = (g: Grid, color: ColorKey) => PREFS.reduce((s, p) => s + (g[p]?.[color] ?? 0), 0);
export const grandTotal = (g: Grid) => PREFS.reduce((s, p) => s + prefTotal(g, p), 0);

const base = "/api/stickers";

export const listSurveys = () => getJson<Survey[]>(base);
export const createSurvey = (input: {
  title: string;
  survey_date?: string;
  location?: string;
  event_id?: string;
  colors?: StickerColor[];
}) => sendJson<Survey>("POST", base, input);
export const getSurvey = (id: string) => getJson<{ survey: Survey; counts: StickerCount[] }>(`${base}/${id}`);
export const patchSurvey = (
  id: string,
  input: Partial<Pick<Survey, "title" | "survey_date" | "location" | "event_id" | "colors" | "status">>
) => sendJson<Survey>("PATCH", `${base}/${id}`, input);
export const deleteSurvey = (id: string) => sendJson<void>("DELETE", `${base}/${id}`);
export const tap = (id: string, pref: string, color: ColorKey, tapId?: string) =>
  sendJson<StickerCount>("POST", `${base}/${id}/tap`, { pref, color, tap_id: tapId });
export const undoTap = (id: string) => sendJson<StickerCount>("POST", `${base}/${id}/undo`);
export const resetSurvey = (id: string) => sendJson<{ ok: boolean }>("POST", `${base}/${id}/reset`);
export const csvPath = (id: string, includeZero: boolean) => `${base}/${id}/csv?include_zero=${includeZero}`;
