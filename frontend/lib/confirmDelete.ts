/** 削除前の確認（ゴミ箱に移すもの） */
export function confirmDelete(label: string): boolean {
  return confirm(`「${label}」を削除しますか？\n（ゴミ箱から30日以内なら復元できます）`);
}
