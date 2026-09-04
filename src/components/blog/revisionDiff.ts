export interface DiffLine {
  type: "added" | "removed" | "unchanged";
  text: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface OmittedDiffLine {
  type: "omitted";
  text: string;
}

export type DisplayDiffLine = DiffLine | OmittedDiffLine;

const MAX_EXACT_DIFF_CELLS = 250_000;
const CONTEXT_LINES = 3;
const MAX_RENDERED_DIFF_LINES = 800;

function linearFallback(oldLines: string[], newLines: string[]): DiffLine[] {
  let prefixLength = 0;
  while (
    prefixLength < oldLines.length &&
    prefixLength < newLines.length &&
    oldLines[prefixLength] === newLines[prefixLength]
  ) {
    prefixLength++;
  }

  let suffixLength = 0;
  while (
    suffixLength < oldLines.length - prefixLength &&
    suffixLength < newLines.length - prefixLength &&
    oldLines[oldLines.length - suffixLength - 1] ===
      newLines[newLines.length - suffixLength - 1]
  ) {
    suffixLength++;
  }

  const diff: DiffLine[] = [];
  for (let index = 0; index < prefixLength; index++) {
    diff.push({
      type: "unchanged",
      text: oldLines[index],
      oldLineNumber: index + 1,
      newLineNumber: index + 1,
    });
  }
  for (
    let index = prefixLength;
    index < oldLines.length - suffixLength;
    index++
  ) {
    diff.push({
      type: "removed",
      text: oldLines[index],
      oldLineNumber: index + 1,
    });
  }
  for (
    let index = prefixLength;
    index < newLines.length - suffixLength;
    index++
  ) {
    diff.push({
      type: "added",
      text: newLines[index],
      newLineNumber: index + 1,
    });
  }
  for (let offset = suffixLength; offset > 0; offset--) {
    const oldIndex = oldLines.length - offset;
    const newIndex = newLines.length - offset;
    diff.push({
      type: "unchanged",
      text: oldLines[oldIndex],
      oldLineNumber: oldIndex + 1,
      newLineNumber: newIndex + 1,
    });
  }
  return diff;
}

export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText ? oldText.split("\n") : [];
  const newLines = newText ? newText.split("\n") : [];
  const m = oldLines.length;
  const n = newLines.length;

  if (m > 0 && n > Math.floor(MAX_EXACT_DIFF_CELLS / m)) {
    return linearFallback(oldLines, newLines);
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const reversedDiff: DiffLine[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      reversedDiff.push({
        type: "unchanged",
        text: oldLines[i - 1],
        oldLineNumber: i,
        newLineNumber: j,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      reversedDiff.push({
        type: "added",
        text: newLines[j - 1],
        newLineNumber: j,
      });
      j--;
    } else {
      reversedDiff.push({
        type: "removed",
        text: oldLines[i - 1],
        oldLineNumber: i,
      });
      i--;
    }
  }

  return reversedDiff.reverse();
}

function omitted(count: number): OmittedDiffLine {
  return {
    type: "omitted",
    text: `${count} unchanged line${count === 1 ? "" : "s"} hidden`,
  };
}

function collapseUnchangedRuns(diff: DiffLine[]): DisplayDiffLine[] {
  const collapsed: DisplayDiffLine[] = [];
  let index = 0;

  while (index < diff.length) {
    if (diff[index].type !== "unchanged") {
      collapsed.push(diff[index]);
      index++;
      continue;
    }

    const start = index;
    while (index < diff.length && diff[index].type === "unchanged") index++;
    const run = diff.slice(start, index);
    const atStart = start === 0;
    const atEnd = index === diff.length;
    const retainedLines = atStart || atEnd ? CONTEXT_LINES : CONTEXT_LINES * 2;

    if (run.length <= retainedLines) {
      collapsed.push(...run);
    } else if (atStart) {
      collapsed.push(
        omitted(run.length - CONTEXT_LINES),
        ...run.slice(-CONTEXT_LINES),
      );
    } else if (atEnd) {
      collapsed.push(
        ...run.slice(0, CONTEXT_LINES),
        omitted(run.length - CONTEXT_LINES),
      );
    } else {
      collapsed.push(
        ...run.slice(0, CONTEXT_LINES),
        omitted(run.length - CONTEXT_LINES * 2),
        ...run.slice(-CONTEXT_LINES),
      );
    }
  }

  return collapsed;
}

export function prepareLineDiff(diff: DiffLine[]): DisplayDiffLine[] {
  const collapsed = collapseUnchangedRuns(diff);
  if (collapsed.length <= MAX_RENDERED_DIFF_LINES) return collapsed;

  const sideLength = Math.floor((MAX_RENDERED_DIFF_LINES - 1) / 2);
  const hiddenCount = collapsed.length - sideLength * 2;
  return [
    ...collapsed.slice(0, sideLength),
    {
      type: "omitted",
      text: `${hiddenCount} additional diff line${hiddenCount === 1 ? "" : "s"} hidden`,
    },
    ...collapsed.slice(-sideLength),
  ];
}
