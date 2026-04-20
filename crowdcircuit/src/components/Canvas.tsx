"use client";

// Touch-first drawing surface for phone controllers.
// Captures strokes into the wire `Drawing` format and streams them up via
// onChange whenever the stroke set changes (pen lift / clear / undo).

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BRUSH_SIZES,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  Drawing,
  MAX_POINTS_PER_STROKE,
  MAX_STROKES,
  PALETTE,
  Stroke,
  emptyDrawing,
  strokeToPath,
} from "@/lib/drawing";

interface CanvasProps {
  value: Drawing;
  onChange: (next: Drawing) => void;
  disabled?: boolean;
}

export function Canvas({ value, onChange, disabled }: CanvasProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [color, setColor] = useState(PALETTE[0].color);
  const [width, setWidth] = useState(BRUSH_SIZES[1]);
  const activeRef = useRef<{ stroke: Stroke; pointerId: number } | null>(null);
  const [, forceTick] = useState(0);

  const tick = useCallback(() => forceTick((n) => n + 1), []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    // Prevent the browser from treating pen-drag as a scroll gesture.
    const prevent = (e: TouchEvent) => e.preventDefault();
    svg.addEventListener("touchstart", prevent, { passive: false });
    svg.addEventListener("touchmove", prevent, { passive: false });
    return () => {
      svg.removeEventListener("touchstart", prevent);
      svg.removeEventListener("touchmove", prevent);
    };
  }, []);

  function toLocal(e: React.PointerEvent<SVGSVGElement>): [number, number] | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
    const y = ((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  }

  function startStroke(e: React.PointerEvent<SVGSVGElement>) {
    if (disabled) return;
    if (value.s.length >= MAX_STROKES) return;
    const p = toLocal(e);
    if (!p) return;
    const stroke: Stroke = { c: color, w: width, p: [p[0], p[1]] };
    activeRef.current = { stroke, pointerId: e.pointerId };
    try {
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    } catch {
      // setPointerCapture not supported — ignore, we still track via pointerId.
    }
    tick();
  }

  function extendStroke(e: React.PointerEvent<SVGSVGElement>) {
    const active = activeRef.current;
    if (!active || active.pointerId !== e.pointerId) return;
    const p = toLocal(e);
    if (!p) return;
    const pts = active.stroke.p;
    const lastX = pts[pts.length - 2];
    const lastY = pts[pts.length - 1];
    // Drop points that barely moved — keeps payloads lean.
    const dx = p[0] - lastX;
    const dy = p[1] - lastY;
    if (dx * dx + dy * dy < 2) return;
    if (pts.length / 2 >= MAX_POINTS_PER_STROKE) return;
    pts.push(p[0], p[1]);
    tick();
  }

  function endStroke(e: React.PointerEvent<SVGSVGElement>) {
    const active = activeRef.current;
    if (!active || active.pointerId !== e.pointerId) return;
    activeRef.current = null;
    if (active.stroke.p.length >= 2) {
      const next: Drawing = { ...value, s: [...value.s, active.stroke] };
      onChange(next);
    } else {
      tick();
    }
  }

  function undo() {
    if (disabled) return;
    if (!value.s.length) return;
    onChange({ ...value, s: value.s.slice(0, -1) });
  }

  function clear() {
    if (disabled) return;
    onChange(emptyDrawing());
  }

  const activeStroke = activeRef.current?.stroke;

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-1 shadow-[0_0_30px_rgba(124,248,208,0.08)]">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
          className={`aspect-[4/3] w-full touch-none select-none rounded-xl ${
            disabled ? "opacity-60" : ""
          }`}
          style={{ background: value.bg ?? "#fbf8ff" }}
          onPointerDown={startStroke}
          onPointerMove={extendStroke}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          role="img"
          aria-label="Drawing canvas"
        >
          {value.s.map((s, i) => (
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
          {activeStroke && activeStroke.p.length >= 2 && (
            <path
              d={strokeToPath(activeStroke)}
              stroke={activeStroke.c}
              strokeWidth={activeStroke.w}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          )}
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PALETTE.map((p) => (
          <button
            key={p.color}
            type="button"
            aria-label={`Color ${p.name}`}
            aria-pressed={color === p.color}
            onClick={() => setColor(p.color)}
            disabled={disabled}
            className={`h-8 w-8 rounded-full border-2 transition ${
              color === p.color ? "border-neon scale-110" : "border-white/20"
            }`}
            style={{ background: p.color }}
          />
        ))}
      </div>

      <div className="flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2">
          {BRUSH_SIZES.map((w) => (
            <button
              key={w}
              type="button"
              aria-label={`Brush ${w}`}
              aria-pressed={width === w}
              onClick={() => setWidth(w)}
              disabled={disabled}
              className={`grid h-10 w-10 place-items-center rounded-full border transition ${
                width === w ? "border-neon bg-neon/10" : "border-white/15 bg-white/5"
              }`}
            >
              <span
                className="rounded-full"
                style={{
                  width: Math.max(4, w),
                  height: Math.max(4, w),
                  background: color,
                }}
              />
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={undo}
          disabled={disabled || !value.s.length}
          className="cc-btn-ghost !px-3 !py-2 text-sm"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={clear}
          disabled={disabled || !value.s.length}
          className="cc-btn-ghost !px-3 !py-2 text-sm"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
