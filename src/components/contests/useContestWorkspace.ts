"use client";

import { useRef, useState } from "react";
import type { ContestRoomProblemDto } from "@/lib/contests/dtos";

export function chooseArenaProblem(
  problems: ContestRoomProblemDto[],
  locks: Record<string, string>,
  lastViewed?: string | null,
) {
  return (
    problems.find((problem) => problem.problemId === lastViewed) ??
    problems.find((problem) => !locks[problem.problemId]) ??
    problems[0]
  );
}

export function useContestWorkspace(roomId: string, userId: string) {
  const [isOpen, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [problemId, setProblemId] = useState<string | null>(null);
  const [storageFailed, setStorageFailed] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const matchViewRef = useRef<HTMLDivElement>(null);
  const scroll = useRef({ x: 0, y: 0 });
  const panelScroll = useRef<
    Array<{ element: HTMLElement; left: number; top: number }>
  >([]);
  const key = `contest-runner-selection-${encodeURIComponent(userId)}:${encodeURIComponent(roomId)}`;

  const select = (id: string) => {
    setProblemId(id);
    try {
      localStorage.setItem(key, id);
    } catch {
      setStorageFailed(true);
    }
  };
  const open = (
    problems: ContestRoomProblemDto[],
    locks?: Record<string, string>,
    currentId?: string,
  ) => {
    let lastViewed = problemId;
    if (!lastViewed && locks) {
      try {
        lastViewed = localStorage.getItem(key);
      } catch {
        setStorageFailed(true);
      }
    }
    const problem = locks
      ? chooseArenaProblem(problems, locks, lastViewed)
      : (problems.find((item) => item.problemId === currentId) ??
        problems.at(-1));
    if (!problem) return;
    scroll.current = { x: window.scrollX, y: window.scrollY };
    const elements = Array.from(
      matchViewRef.current?.querySelectorAll<HTMLElement>("*") ?? [],
    );
    let parent = matchViewRef.current?.parentElement;
    while (parent) {
      elements.push(parent);
      parent = parent.parentElement;
    }
    panelScroll.current = elements
      .filter((element) => element.scrollTop || element.scrollLeft)
      .map((element) => ({
        element,
        left: element.scrollLeft,
        top: element.scrollTop,
      }));
    select(problem.problemId);
    setHasOpened(true);
    setOpen(true);
    window.scrollTo(0, 0);
  };
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => {
      launcherRef.current?.focus({ preventScroll: true });
      panelScroll.current.forEach(({ element, left, top }) =>
        element.scrollTo({ left, top, behavior: "instant" }),
      );
      window.scrollTo({
        left: scroll.current.x,
        top: scroll.current.y,
        behavior: "instant",
      });
    });
  };
  return {
    isOpen,
    hasOpened,
    problemId,
    storageFailed,
    launcherRef,
    matchViewRef,
    select,
    open,
    close,
  };
}
