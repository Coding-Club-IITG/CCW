"use client";

import SegmentedControl from "@/components/public/SegmentedControl";

type Tab = {
  key: string;
  label: string;
};

type Props = {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (key: string) => void;
  label?: string;
};

export default function PlatformTabs({
  tabs,
  activeTab,
  onTabChange,
  label = "Filter",
}: Props) {
  return (
    <SegmentedControl
      label={label}
      segments={tabs.map((tab) => ({
        label: tab.label,
        active: activeTab === tab.key,
        onClick: () => onTabChange(tab.key),
      }))}
    />
  );
}
