"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { expectAppData } from "@/lib/api/result";
import UserAvatar from "@/components/shared/UserAvatar";
import UserSearch from "@/components/shared/UserSearch";
import styles from "./MemberPicker.module.scss";

type MemberSummary = {
  id: string;
  name: string;
  image?: string | null;
};

interface MemberPickerProps {
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}

// Multi-select member picker
export default function MemberPicker({
  value,
  onChange,
  placeholder = "Add member…",
}: MemberPickerProps) {
  const [cache, setCache] = useState<Record<string, MemberSummary>>({});

  useEffect(() => {
    const missing = value.filter((id) => !cache[id]);
    if (missing.length === 0) return;

    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(
          `/api/users?ids=${encodeURIComponent(missing.join(","))}`,
          { signal: controller.signal },
        );
        const data = await expectAppData<{
          items?: Array<{ _id: string; name: string; image?: string | null }>;
        }>(response);
        const resolved: Record<string, MemberSummary> = {};
        for (const user of data.items ?? []) {
          resolved[user._id] = {
            id: user._id,
            name: user.name,
            image: user.image,
          };
        }
        setCache((current) => ({ ...current, ...resolved }));
      } catch {
        // A failed lookup only costs the display name
      }
    })();

    return () => controller.abort();
  }, [value, cache]);

  return (
    <div className={styles.picker}>
      {value.length > 0 && (
        <ul className={styles.selected}>
          {value.map((id) => {
            const member = cache[id];
            return (
              <li key={id} className={styles.chip}>
                <UserAvatar
                  name={member?.name}
                  image={member?.image}
                  size={20}
                  imageClassName={styles.chipAvatar}
                  fallbackClassName={styles.chipInitials}
                />
                <span>{member?.name ?? "Loading…"}</span>
                <button
                  type="button"
                  aria-label={`Remove ${member?.name ?? "member"}`}
                  onClick={() => onChange(value.filter((slot) => slot !== id))}
                >
                  <X size={13} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <UserSearch
        excludedIds={value}
        placeholder={placeholder}
        onSelect={(user) => {
          setCache((current) => ({
            ...current,
            [user.id]: { id: user.id, name: user.name, image: user.image },
          }));
          onChange([...value, user.id]);
        }}
      />
    </div>
  );
}
