"use client";

import styles from "./PlatformTabs.module.scss";

type Tab = {
  key: string;
  label: string;
};

type Props = {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (key: string) => void;
};

export default function PlatformTabs({ tabs, activeTab, onTabChange }: Props) {
  return (
    <div className={styles.tabs}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          className={`${styles.tab} ${activeTab === tab.key ? styles.active : ""}`}
          onClick={() => onTabChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
