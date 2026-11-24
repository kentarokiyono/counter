"use client";

import { useEffect, useState } from "react";
import { Member, listMembers } from "@/lib/membersApi";
import { applyLive, subscribeLive } from "@/lib/live";

/**
 * メンバー一覧は画面のあちこち（アイコン・担当者選択など）で使うので、
 * 取得とリアルタイム購読を1本にまとめて共有する。
 */
let cache: Member[] = [];
let started = false;
const listeners = new Set<(m: Member[]) => void>();

function emit(next: Member[]) {
  cache = [...next].sort((a, b) => a.name.localeCompare(b.name, "ja"));
  listeners.forEach((l) => l(cache));
}

function start() {
  if (started) return;
  started = true;
  const load = () => listMembers().then(emit).catch(() => {});
  load();
  subscribeLive("members", (ev, row) => emit(applyLive(cache, ev, row, "end")), load);
}

export function useMembers(): { members: Member[] } {
  const [members, setMembers] = useState<Member[]>(cache);
  useEffect(() => {
    start();
    listeners.add(setMembers);
    setMembers(cache);
    return () => {
      listeners.delete(setMembers);
    };
  }, []);
  return { members };
}
