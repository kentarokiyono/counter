"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";
import { downloadCsv } from "@/lib/exportCsv";

export default function CsvButton({ kind }: { kind: "tasks" | "events" }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="ios-btn-gray px-3"
      disabled={busy}
      title="Excelで開けるCSVファイルを保存"
      onClick={async () => {
        setBusy(true);
        try {
          if ((await downloadCsv(kind)) !== "cancelled") toast.success("CSVを保存しました");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "書き出せませんでした");
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "…" : "CSV"}
    </button>
  );
}
