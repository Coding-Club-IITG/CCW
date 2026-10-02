"use client";

import { expectAppData } from "@/lib/api/result";
import EntityPicker from "@/components/shared/EntityPicker";
import type { UserSearchItem } from "@/components/shared/UserSearch";

async function resolveMembers(ids: string[], signal: AbortSignal) {
  const response = await fetch(
    `/api/users?ids=${encodeURIComponent(ids.join(","))}`,
    { signal },
  );
  const data = await expectAppData<{
    items: Array<{ _id: string; name: string; image?: string | null }>;
  }>(response);
  return data.items.map((user) => ({
    id: user._id,
    name: user.name,
    image: user.image,
  }));
}

interface MemberPickerProps {
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  readOnly?: boolean;
  initialItems?: UserSearchItem[];
  maxItems?: number;
}

export default function MemberPicker({
  placeholder = "Add member…",
  ...props
}: MemberPickerProps) {
  return (
    <EntityPicker
      {...props}
      resolve={resolveMembers}
      placeholder={placeholder}
      itemLabel="member"
    />
  );
}
