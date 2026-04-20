// Wire format for phone-drawn submissions. Short keys keep payloads small
// over Socket.IO; a typical doodle is ~1–4 KB of JSON.

export interface Stroke {
  /** color — any valid CSS color string */
  c: string;
  /** stroke width in canvas pixels */
  w: number;
  /** flat array of coordinates: [x0, y0, x1, y1, ...] in viewport units */
  p: number[];
}

export interface Drawing {
  /** viewbox width */
  W: number;
  /** viewbox height */
  H: number;
  /** strokes in paint order */
  s: Stroke[];
  /** optional solid background color */
  bg?: string;
}

export const CANVAS_WIDTH = 640;
export const CANVAS_HEIGHT = 480;
export const MAX_STROKES = 300;
export const MAX_POINTS_PER_STROKE = 400;

export const PALETTE: { name: string; color: string }[] = [
  { name: "Ink", color: "#0b0a1a" },
  { name: "Mist", color: "#e9e6ff" },
  { name: "Ember", color: "#ff4f7b" },
  { name: "Neon", color: "#7cf8d0" },
  { name: "Sol", color: "#ffd36e" },
  { name: "Orchid", color: "#b080ff" },
  { name: "Sky", color: "#6fb3ff" },
  { name: "Moss", color: "#6fd67a" },
];

export const BRUSH_SIZES = [3, 6, 10, 18];

export function emptyDrawing(): Drawing {
  return { W: CANVAS_WIDTH, H: CANVAS_HEIGHT, s: [], bg: "#fbf8ff" };
}

// Convert a stroke's flat point list into an SVG cubic-bezier-smoothed path.
// Simple Catmull-Rom-ish smoothing — fast and good-looking for doodles.
export function strokeToPath(stroke: Stroke): string {
  const pts = stroke.p;
  if (pts.length < 2) return "";
  if (pts.length === 2) return `M ${pts[0]} ${pts[1]}`;
  let d = `M ${pts[0]} ${pts[1]}`;
  for (let i = 2; i < pts.length - 2; i += 2) {
    const xc = (pts[i] + pts[i + 2]) / 2;
    const yc = (pts[i + 1] + pts[i + 3]) / 2;
    d += ` Q ${pts[i]} ${pts[i + 1]} ${xc} ${yc}`;
  }
  const last = pts.length;
  d += ` L ${pts[last - 2]} ${pts[last - 1]}`;
  return d;
}

export function isDrawingNonTrivial(drawing: Drawing): boolean {
  if (!drawing.s.length) return false;
  // At least one stroke with >1 point, and overall more than ~8 points.
  let total = 0;
  for (const s of drawing.s) total += s.p.length / 2;
  return total >= 8;
}

export function clampDrawing(drawing: Drawing): Drawing {
  const safe: Drawing = {
    W: drawing.W || CANVAS_WIDTH,
    H: drawing.H || CANVAS_HEIGHT,
    s: [],
    bg: drawing.bg,
  };
  for (const s of drawing.s.slice(0, MAX_STROKES)) {
    safe.s.push({
      c: typeof s.c === "string" ? s.c.slice(0, 16) : "#000",
      w: Math.max(1, Math.min(40, Number(s.w) || 4)),
      p: s.p.slice(0, MAX_POINTS_PER_STROKE * 2).map((n) => Number(n) || 0),
    });
  }
  return safe;
}
