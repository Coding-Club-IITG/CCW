"use client";

import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, Plus, Search } from "lucide-react";

import UserAvatar from "@/components/shared/UserAvatar";
import styles from "./UserSearch.module.scss";

export interface UserSearchItem {
  id: string;
  name: string;
  image?: string | null;
  secondary?: string;
}

interface UserSearchProps {
  onSelect: (user: UserSearchItem) => void;
  excludedIds?: Iterable<string>;
  placeholder?: string;
  search?: (query: string, signal: AbortSignal) => Promise<UserSearchItem[]>;
  minLength?: number;
}

async function defaultSearch(query: string, signal: AbortSignal) {
  const response = await fetch(
    `/api/users?search=${encodeURIComponent(query)}&limit=8`,
    { signal },
  );
  if (!response.ok) throw new Error("User search failed");
  const data = (await response.json()) as {
    items?: Array<{
      _id: string;
      name: string;
      email?: string;
      image?: string | null;
    }>;
  };
  return (data.items || []).map((user) => ({
    id: user._id,
    name: user.name,
    image: user.image,
    secondary: user.email,
  }));
}

export default function UserSearch({
  onSelect,
  excludedIds = [],
  placeholder = "Search users by name or email…",
  search = defaultSearch,
  minLength = 2,
}: UserSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const excludedKey = [...excludedIds].sort().join(",");
  const excluded = useMemo(
    () => new Set(excludedKey ? excludedKey.split(",") : []),
    [excludedKey],
  );

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < minLength) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        setResults(
          (await search(trimmed, controller.signal)).filter(
            (user) => !excluded.has(user.id),
          ),
        );
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [excluded, minLength, query, search]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.inputWrap}>
        <Search aria-hidden="true" size={15} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
        />
        {loading && <LoaderCircle className={styles.spinner} size={15} />}
      </div>
      {results.length > 0 && (
        <div className={styles.results}>
          {results.map((user) => (
            <button
              type="button"
              key={user.id}
              onClick={() => {
                onSelect(user);
                setQuery("");
                setResults([]);
              }}
            >
              <UserAvatar
                name={user.name}
                image={user.image}
                size={32}
                imageClassName={styles.avatar}
                fallbackClassName={styles.avatarFallback}
              />
              <span className={styles.identity}>
                <strong>{user.name}</strong>
                {user.secondary && <small>{user.secondary}</small>}
              </span>
              <Plus aria-hidden="true" size={15} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
