"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** 旧「稼働状況」ページ。統計の「メンバー」タブに統合した。 */
export default function ActivityRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/analytics?tab=members");
  }, [router]);
  return null;
}
