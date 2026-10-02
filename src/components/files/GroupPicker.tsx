"use client";

import { Users } from "lucide-react";
import { useState } from "react";

import { expectAppData } from "@/lib/api/result";
import { FILE_SHARING_LIMIT } from "@/lib/constants";
import type { SharingGroupSummary } from "@/lib/files/types";
import EntityPicker from "@/components/shared/EntityPicker";

import GroupModal from "./GroupModal";

async function fetchGroups(query: string, signal: AbortSignal) {
  const response = await fetch(`/api/files/groups?${query}`, { signal });
  const data = await expectAppData<{ items: SharingGroupSummary[] }>(response);
  return data.items.map((group) => ({
    id: group.id,
    name: group.name,
    secondary: `${group.memberCount} ${group.memberCount === 1 ? "member" : "members"}${group.module ? ` · ${group.module}` : ""}`,
  }));
}

function resolveGroups(ids: string[], signal: AbortSignal) {
  return fetchGroups(
    `ids=${encodeURIComponent(ids.join(","))}&limit=100`,
    signal,
  );
}

function searchGroups(query: string, signal: AbortSignal) {
  return fetchGroups(`search=${encodeURIComponent(query)}&limit=8`, signal);
}

export default function GroupPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [inspecting, setInspecting] = useState<string | null>(null);
  return (
    <>
      <EntityPicker
        maxItems={FILE_SHARING_LIMIT}
        value={value}
        onChange={onChange}
        resolve={resolveGroups}
        search={searchGroups}
        placeholder="Search sharing groups…"
        itemLabel="group"
        resultIcon={<Users size={16} />}
        onInspect={setInspecting}
      />
      {inspecting && (
        <GroupModal groupId={inspecting} onClose={() => setInspecting(null)} />
      )}
    </>
  );
}
