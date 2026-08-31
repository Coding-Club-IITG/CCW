"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";

import { blogHref, type BlogQuery } from "@/lib/blog/listing";
import styles from "./Blog.module.scss";

export default function BlogSearch({
  search,
  query,
}: {
  search: string;
  query: BlogQuery;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(search);

  // Keep the field in step when visitor navigates back or clears a filter
  useEffect(() => setDraft(search), [search]);

  return (
    <form
      className={styles.searchField}
      onSubmit={(event) => {
        event.preventDefault();
        router.push(blogHref(query, { search: draft.trim(), page: "" }));
      }}
    >
      <Search size={14} aria-hidden="true" />
      <input
        type="search"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Search posts"
        aria-label="Search posts"
        maxLength={100}
      />
      <button type="submit" className={styles.srOnly}>
        Search
      </button>
    </form>
  );
}
