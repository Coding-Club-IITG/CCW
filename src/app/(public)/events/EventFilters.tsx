import { LayoutGrid, ListTree } from "lucide-react";
import {
  eventsHref,
  type EventQuery,
  type EventView,
} from "@/lib/events/listing";
import FilterChips from "@/components/public/FilterChips";
import SegmentedControl from "@/components/public/SegmentedControl";
import styles from "./Events.module.scss";

type Props = {
  modules: string[];
  activeModule: string;
  view: EventView;
  query: EventQuery;
};

/** Module chips and the layout toggle, both URL-driven */
export default function EventFilters({
  modules,
  activeModule,
  view,
  query,
}: Props) {
  const chips = [
    {
      label: "All",
      href: eventsHref(query, { module: "", show: "" }),
      active: !activeModule,
    },
    ...modules.map((moduleName) => ({
      label: moduleName,
      href: eventsHref(query, {
        module: activeModule === moduleName ? "" : moduleName,
        show: "",
      }),
      active: activeModule === moduleName,
    })),
  ];

  const segments = [
    {
      label: "Posters",
      href: eventsHref(query, { view: "posters" }),
      active: view === "posters",
      Icon: LayoutGrid,
    },
    {
      label: "Timeline",
      href: eventsHref(query, { view: "timeline" }),
      active: view === "timeline",
      Icon: ListTree,
    },
  ];

  return (
    <div className={styles.filterBar}>
      <FilterChips options={chips} label="Filter events by module" />
      <SegmentedControl segments={segments} label="Event layout" />
    </div>
  );
}
