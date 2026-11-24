// 日本の祝日（内閣府の定める現行ルールで計算。2022〜2099年向け）。外部サービスは使わない。

const cache = new Map<number, Map<string, string>>();

function key(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** m月の第n月曜日 */
function nthMonday(y: number, m: number, n: number): number {
  const first = new Date(y, m - 1, 1).getDay();
  return 1 + ((8 - first) % 7) + (n - 1) * 7;
}

function equinox(y: number, base: number): number {
  return Math.floor(base + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
}

function build(y: number): Map<string, string> {
  const map = new Map<string, string>();
  const add = (m: number, d: number, name: string) => map.set(key(y, m, d), name);
  add(1, 1, "元日");
  add(1, nthMonday(y, 1, 2), "成人の日");
  add(2, 11, "建国記念の日");
  add(2, 23, "天皇誕生日");
  add(3, equinox(y, 20.8431), "春分の日");
  add(4, 29, "昭和の日");
  add(5, 3, "憲法記念日");
  add(5, 4, "みどりの日");
  add(5, 5, "こどもの日");
  add(7, nthMonday(y, 7, 3), "海の日");
  add(8, 11, "山の日");
  add(9, nthMonday(y, 9, 3), "敬老の日");
  add(9, equinox(y, 23.2488), "秋分の日");
  add(10, nthMonday(y, 10, 2), "スポーツの日");
  add(11, 3, "文化の日");
  add(11, 23, "勤労感謝の日");

  const base = [...map.keys()].sort();
  // 国民の休日: 祝日に挟まれた平日
  for (let i = 0; i + 1 < base.length; i++) {
    const a = new Date(base[i] + "T00:00:00");
    const b = new Date(base[i + 1] + "T00:00:00");
    if ((b.getTime() - a.getTime()) / 86400000 === 2) {
      const mid = new Date(a);
      mid.setDate(a.getDate() + 1);
      if (mid.getDay() !== 0) map.set(key(y, mid.getMonth() + 1, mid.getDate()), "国民の休日");
    }
  }
  // 振替休日: 日曜の祝日の後の、最初の祝日でない日
  for (const k of base) {
    const d = new Date(k + "T00:00:00");
    if (d.getDay() !== 0) continue;
    const s = new Date(d);
    do s.setDate(s.getDate() + 1);
    while (map.has(key(s.getFullYear(), s.getMonth() + 1, s.getDate())));
    if (s.getFullYear() === y) map.set(key(y, s.getMonth() + 1, s.getDate()), "振替休日");
  }
  return map;
}

/** "YYYY-MM-DD" が祝日なら名前、そうでなければ null */
export function holidayName(ymd: string): string | null {
  const y = Number(ymd.slice(0, 4));
  if (!cache.has(y)) cache.set(y, build(y));
  return cache.get(y)!.get(ymd) ?? null;
}
