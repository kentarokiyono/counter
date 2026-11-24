"""
バックアップ（GitHub Actions の Backup で保存した backup.json.gz）から Supabase に書き戻す。

    cd backend
    python restore_backup.py backup.json.gz            # 何件戻るかの確認だけ
    python restore_backup.py backup.json.gz --apply    # 実際に書き戻す（同じ id は上書き）

.env の SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY を使う。テーブルは schema.sql で作成済みであること。
"""
import gzip
import json
import sys

from config import get_settings
from cron import BACKUP_TABLES as ORDER  # 外部キーの順番（親 → 子）

CHUNK = 200


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    path, apply = sys.argv[1], "--apply" in sys.argv
    opener = gzip.open if path.endswith(".gz") else open
    with opener(path, "rt", encoding="utf-8") as f:
        data = json.load(f)
    print(f"バックアップ作成日時: {data.get('created_at')}")
    client = None
    if apply:
        from supabase import create_client

        s = get_settings()
        client = create_client(s.supabase_url, s.supabase_service_role_key)
    for table, count in restore(data, client):
        print(f"  {table}: {count}件" + ("" if apply else "（確認のみ）"))
    if not apply:
        print("\n書き戻すには --apply を付けて実行してください。")


def restore(data: dict, client) -> list[tuple[str, int]]:
    """client が None なら件数の確認だけ。戻した（戻す予定の）件数を表ごとに返す。"""
    counts = []
    for table in ORDER:
        rows = data["tables"].get(table) or []
        counts.append((table, len(rows)))
        if client is not None:
            for i in range(0, len(rows), CHUNK):
                client.table(table).upsert(rows[i : i + CHUNK]).execute()
    return counts


if __name__ == "__main__":
    main()
