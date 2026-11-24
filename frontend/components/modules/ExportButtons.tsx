"use client";

import { useToast } from "@/components/Toast";
import { copyText, downloadText } from "@/lib/exportText";

/**
 * 生成した文章の書き出し（コピー／ファイルに保存）。外部サービスには送らない。
 * onDone は書き出したとき（下書きを「保存済み」にする等）に呼ぶ。
 */
export default function ExportButtons({
  text,
  filename,
  onDone,
}: {
  text: string;
  filename: string;
  onDone?: () => void;
}) {
  const toast = useToast();
  const empty = !text.trim();

  async function copy() {
    try {
      await copyText(text);
      toast.success("コピーしました");
      onDone?.();
    } catch {
      toast.error("コピーできませんでした");
    }
  }

  async function download() {
    try {
      if ((await downloadText(filename, text)) === "cancelled") return;
      toast.success("ファイルに保存しました");
      onDone?.();
    } catch {
      toast.error("保存できませんでした");
    }
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" className="ios-btn-gray w-full py-3" onClick={copy} disabled={empty}>
        コピー
      </button>
      <button type="button" className="ios-btn w-full py-3" onClick={download} disabled={empty}>
        ファイルに保存
      </button>
    </div>
  );
}
