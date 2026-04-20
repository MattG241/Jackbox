// Read-only SVG renderer for a wire-format Drawing. Used on the host screen
// for reveal/vote and on the player screen when voting on drawings.

import { CANVAS_HEIGHT, CANVAS_WIDTH, Drawing, strokeToPath } from "@/lib/drawing";

interface DrawingViewProps {
  drawing: Drawing;
  className?: string;
}

export function DrawingView({ drawing, className }: DrawingViewProps) {
  return (
    <svg
      viewBox={`0 0 ${drawing.W || CANVAS_WIDTH} ${drawing.H || CANVAS_HEIGHT}`}
      className={`aspect-[4/3] w-full rounded-xl ${className ?? ""}`}
      style={{ background: drawing.bg ?? "#fbf8ff" }}
      role="img"
      aria-label="Player drawing"
    >
      {drawing.s.map((s, i) => (
        <path
          key={i}
          d={strokeToPath(s)}
          stroke={s.c}
          strokeWidth={s.w}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ))}
    </svg>
  );
}

export function tryParseDrawing(text: string): Drawing | null {
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== "object") return null;
    if (!Array.isArray(v.s)) return null;
    return v as Drawing;
  } catch {
    return null;
  }
}
