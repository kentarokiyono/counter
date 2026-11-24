"use client";

import { useEffect, useState } from "react";
import ModulePageHeader from "@/components/ModulePageHeader";
import Segmented from "@/components/ui/Segmented";
import TeamAnalytics from "@/components/TeamAnalytics";
import MemberActivity from "@/components/MemberActivity";

type Tab = "team" | "members";

/** 統計（チーム全体のタスク・イベント / メンバーごとの稼働と担当） */
export default function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>("team");

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "members") setTab("members");
  }, []);

  function change(t: Tab) {
    setTab(t);
    window.history.replaceState(null, "", t === "members" ? "/analytics?tab=members" : "/analytics");
  }

  return (
    <div className="mx-auto max-w-7xl">
      <ModulePageHeader title="統計" />
      <Segmented<Tab>
        className="mb-5 w-full max-w-xs"
        value={tab}
        onChange={change}
        options={[
          { value: "team", label: "チーム" },
          { value: "members", label: "メンバー" },
        ]}
      />
      {tab === "team" ? <TeamAnalytics /> : <MemberActivity />}
    </div>
  );
}
