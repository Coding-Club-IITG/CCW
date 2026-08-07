"use client";

import { useState } from "react";
import RatingLeaderboardClient from "@/components/leaderboard/RatingLeaderboardClient";
import ContestCalendar from "@/components/cp/ContestCalendar";
import styles from "./CPPage.module.scss";
import {
  Trophy as IconTrophy,
  CalendarDays as IconCalendar,
} from "lucide-react";

type RatingLeaderboardEntry = {
  id: string;
  name: string;
  handle: string;
  rating: number;
  rank: string;
};

export type ContestEntry = {
  id: string;
  platform: string;
  name: string;
  startTime: string;
  endTime: string;
  durationSeconds: number;
  url: string;
};

type Props = {
  cfEntries: RatingLeaderboardEntry[];
  acEntries: RatingLeaderboardEntry[];
  contests: ContestEntry[];
};

const TABS = [
  { key: "rating", label: "Rating", icon: IconTrophy },
  { key: "contests", label: "Contests", icon: IconCalendar },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function CPPageClient({
  cfEntries,
  acEntries,
  contests,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>("rating");

  return (
    <div className={styles.cpPage}>
      <aside className={styles.sidebar}>
        <nav className={styles.sidebarNav}>
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                className={`${styles.sidebarTab} ${activeTab === tab.key ? styles.active : ""}`}
                onClick={() => setActiveTab(tab.key)}
              >
                <Icon className={styles.icon} />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </aside>
      <main className={styles.content}>
        {activeTab === "rating" && (
          <RatingLeaderboardClient
            cfEntries={cfEntries}
            acEntries={acEntries}
          />
        )}
        {activeTab === "contests" && <ContestCalendar contests={contests} />}
      </main>
    </div>
  );
}
