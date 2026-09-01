import { blogHref, type BlogQuery, type BlogSort } from "@/lib/blog/listing";
import FilterChips from "@/components/public/FilterChips";
import SegmentedControl from "@/components/public/SegmentedControl";
import BlogSearch from "./BlogSearch";
import styles from "./Blog.module.scss";

type Props = {
  availableTags: string[];
  activeTag: string;
  search: string;
  sort: BlogSort;
  query: BlogQuery;
};

/** Tag chips, sort order and search */
export default function BlogFilters({
  availableTags,
  activeTag,
  search,
  sort,
  query,
}: Props) {
  const chips = [
    {
      label: "All",
      href: blogHref(query, { tag: "", page: "" }),
      active: !activeTag,
    },
    ...availableTags.map((tag) => ({
      label: tag,
      href: blogHref(query, {
        tag: activeTag === tag ? "" : tag,
        page: "",
      }),
      active: activeTag === tag,
    })),
  ];

  const segments = [
    {
      label: "Newest",
      href: blogHref(query, { sort: "published", page: "" }),
      active: sort === "published",
    },
    {
      label: "Recently updated",
      href: blogHref(query, { sort: "updated", page: "" }),
      active: sort === "updated",
    },
  ];

  return (
    <div className={styles.filterBar}>
      <FilterChips options={chips} label="Filter posts by tag" />
      <div className={styles.controls}>
        <SegmentedControl segments={segments} label="Sort posts" />
        <BlogSearch search={search} query={query} />
      </div>
    </div>
  );
}
