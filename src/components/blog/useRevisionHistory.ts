"use client";

import { useEffect, useState } from "react";

import { expectAppData } from "@/lib/api/result";
import type { BlogRevisionDto, BlogRevisionListDto } from "@/lib/blog/types";

export function useRevisionHistory(endpoint: string) {
  const [page, setPage] = useState(1);
  const [list, setList] = useState<BlogRevisionListDto | null>(null);
  const [listError, setListError] = useState("");
  const [listAttempt, setListAttempt] = useState(0);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [cache, setCache] = useState<Record<number, BlogRevisionDto>>({});
  const [versionError, setVersionError] = useState("");
  const [versionAttempt, setVersionAttempt] = useState(0);
  const [mode, setMode] = useState<"live" | "previous" | "raw">("live");
  const compareMode =
    mode === "previous" && selectedVersion === 1 ? "live" : mode;

  useEffect(() => {
    const controller = new AbortController();
    setList(null);
    setListError("");
    setSelectedVersion(null);

    async function loadList() {
      try {
        const response = await fetch(`${endpoint}?page=${page}`, {
          signal: controller.signal,
        });
        const data = await expectAppData<BlogRevisionListDto>(response);
        if (!controller.signal.aborted) {
          setList(data);
          setSelectedVersion(data.revisions[0]?.version ?? null);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setListError(
            error instanceof Error
              ? error.message
              : "Failed to load revisions.",
          );
        }
      }
    }

    void loadList();
    return () => controller.abort();
  }, [endpoint, page, listAttempt]);

  useEffect(() => {
    if (selectedVersion === null) return;
    const controller = new AbortController();
    const needed = [selectedVersion];
    if (compareMode === "previous") needed.push(selectedVersion - 1);
    const missing = needed.filter((version) => !cache[version]);
    setVersionError("");
    if (!missing.length) return;

    async function loadVersions() {
      try {
        const revisions = await Promise.all(
          missing.map(async (version) => {
            const response = await fetch(`${endpoint}?version=${version}`, {
              signal: controller.signal,
            });
            return (
              await expectAppData<{ revision: BlogRevisionDto }>(response)
            ).revision;
          }),
        );
        if (!controller.signal.aborted) {
          setCache((previous) => ({
            ...previous,
            ...Object.fromEntries(
              revisions.map((revision) => [revision.version, revision]),
            ),
          }));
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setVersionError(
            error instanceof Error
              ? error.message
              : "Failed to load revision content.",
          );
        }
      }
    }

    void loadVersions();
    return () => controller.abort();
  }, [endpoint, selectedVersion, compareMode, cache, versionAttempt]);

  const selectedRevision =
    selectedVersion === null ? undefined : cache[selectedVersion];
  const previousRevision =
    selectedVersion === null ? undefined : cache[selectedVersion - 1];
  const loadingVersion =
    selectedVersion !== null &&
    !versionError &&
    (!selectedRevision || (compareMode === "previous" && !previousRevision));

  return {
    page,
    setPage,
    list,
    listError,
    loadingList: !list && !listError,
    retryList: () => setListAttempt((attempt) => attempt + 1),
    selectedVersion,
    selectVersion: (version: number) => {
      setSelectedVersion(version);
      if (version === 1 && mode === "previous") setMode("live");
    },
    selectedRevision,
    previousRevision,
    compareMode,
    setCompareMode: setMode,
    loadingVersion,
    versionError,
    retryVersion: () => setVersionAttempt((attempt) => attempt + 1),
  };
}
