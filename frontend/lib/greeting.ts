/** ホームの挨拶（端末の時刻で切り替える） */
export function greeting(name: string, date: Date = new Date()): string {
  const h = date.getHours();
  if (h >= 4 && h < 7) return `早起きですね、${name}さん`;
  if (h >= 7 && h < 11) return `おはようございます、${name}さん`;
  if (h >= 11 && h < 18) return `こんにちは、${name}さん`;
  if (h >= 18 && h < 23) return `こんばんは、${name}さん`;
  return `夜更かしですね、${name}さん`;
}
