"use client";

import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";

import UserAvatar from "@/components/shared/UserAvatar";
import UserSearch, {
  type UserSearchItem,
} from "@/components/shared/UserSearch";
import styles from "./MemberPicker.module.scss";

interface EntityPickerProps {
  value: string[];
  onChange: (ids: string[]) => void;
  resolve: (ids: string[], signal: AbortSignal) => Promise<UserSearchItem[]>;
  search?: (query: string, signal: AbortSignal) => Promise<UserSearchItem[]>;
  placeholder: string;
  itemLabel: string;
  readOnly?: boolean;
  resultIcon?: ReactNode;
  onInspect?: (id: string) => void;
  initialItems?: UserSearchItem[];
  maxItems?: number;
}

export default function EntityPicker({
  value,
  onChange,
  resolve,
  search,
  placeholder,
  itemLabel,
  readOnly,
  resultIcon,
  onInspect,
  initialItems = [],
  maxItems,
}: EntityPickerProps) {
  const [cache, setCache] = useState<Record<string, UserSearchItem | null>>(
    () => Object.fromEntries(initialItems.map((item) => [item.id, item])),
  );
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const missing = value.filter((id) => !(id in cache));
    if (!missing.length) return;
    const controller = new AbortController();
    void resolve(missing, controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return;
        const resolved: Record<string, UserSearchItem | null> =
          Object.fromEntries(missing.map((id) => [id, null]));
        items.forEach((item) => {
          resolved[item.id] = item;
        });
        setCache((current) => ({ ...current, ...resolved }));
        setFailed(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [value, cache, resolve, attempt]);

  return (
    <div className={styles.picker}>
      {value.length > 0 && (
        <ul className={styles.selected}>
          {value.map((id) => {
            const item = cache[id];
            const name =
              item?.name ??
              (id in cache
                ? `Unavailable ${itemLabel}`
                : failed
                  ? `${itemLabel} ${id.slice(-6)}`
                  : "Loading…");
            return (
              <li key={id} className={styles.chip}>
                {resultIcon ?? (
                  <UserAvatar
                    name={item?.name}
                    image={item?.image}
                    size={20}
                    imageClassName={styles.chipAvatar}
                    fallbackClassName={styles.chipInitials}
                  />
                )}
                {onInspect && item ? (
                  <button
                    type="button"
                    onClick={() => onInspect(id)}
                    className={styles.inspect}
                    aria-label={`View ${name}`}
                  >
                    {name}
                  </button>
                ) : (
                  <span>{name}</span>
                )}
                {!readOnly && (
                  <button
                    type="button"
                    aria-label={`Remove ${name}`}
                    onClick={() =>
                      onChange(value.filter((slot) => slot !== id))
                    }
                  >
                    <X size={13} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {failed && (
        <button
          type="button"
          className={styles.retry}
          onClick={() => setAttempt((current) => current + 1)}
        >
          Could not load selected {itemLabel}s. Retry
        </button>
      )}
      {!readOnly && (maxItems === undefined || value.length < maxItems) && (
        <UserSearch
          excludedIds={value}
          placeholder={placeholder}
          search={search}
          resultIcon={resultIcon}
          onSelect={(item) => {
            setCache((current) => ({ ...current, [item.id]: item }));
            onChange([...value, item.id]);
          }}
        />
      )}
    </div>
  );
}
