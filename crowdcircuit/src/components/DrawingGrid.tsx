"use client";

import { type ReactNode, useMemo } from "react";

// Scalable TV drawing grid used on reveal/vote panels. Designed to lay out
// cleanly for any count between 1 and 10 without overlap:
//   1   → single large cell (full width)
//   2   → 2 × 1
//   3   → 3 × 1 (one row, three big cards)
//   4   → 2 × 2
//   5–6 → 3 × 2
//   7–8 → 4 × 2
//   9   → 3 × 3
//   10  → 5 × 2
// Each cell keeps a square aspect ratio so drawings render without
// stretching; the grid itself fills whatever space the parent gives it,
// so this slots into the existing flex-1 min-h-0 panel.
export interface DrawingGridProps {
  count: number;
  renderCell: (index: number) => ReactNode;
  className?: string;
}

interface GridShape {
  cols: number;
  rows: number;
}

export function gridShapeFor(count: number): GridShape {
  if (count <= 0) return { cols: 1, rows: 1 };
  if (count === 1) return { cols: 1, rows: 1 };
  if (count === 2) return { cols: 2, rows: 1 };
  if (count === 3) return { cols: 3, rows: 1 };
  if (count === 4) return { cols: 2, rows: 2 };
  if (count <= 6) return { cols: 3, rows: 2 };
  if (count <= 8) return { cols: 4, rows: 2 };
  if (count === 9) return { cols: 3, rows: 3 };
  return { cols: 5, rows: 2 }; // 10
}

export function DrawingGrid({
  count,
  renderCell,
  className = "",
}: DrawingGridProps) {
  const { cols, rows } = useMemo(() => gridShapeFor(count), [count]);
  return (
    <div
      className={`grid h-full w-full gap-3 ${className}`}
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          // min-w/h-0 + overflow-hidden keeps each cell inside its track
          // so wide drawings can't push siblings out of place.
          className="flex min-h-0 min-w-0 overflow-hidden"
        >
          {renderCell(i)}
        </div>
      ))}
    </div>
  );
}
