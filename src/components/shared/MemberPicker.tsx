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

async function searchManagers(query: string, signal: AbortSignal) {
  const response = await fetch(
    `/api/users?search=${encodeURIComponent(query)}&limit=8&managersOnly=true`,
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
  managersOnly?: boolean;
}

export default function MemberPicker({
  placeholder = "Add member…",
  managersOnly = false,
  ...props
}: MemberPickerProps) {
  return (
    <EntityPicker
      {...props}
      resolve={resolveMembers}
      search={managersOnly ? searchManagers : undefined}
      placeholder={placeholder}
      itemLabel="member"
    />
  );
}
