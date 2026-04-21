"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AVATAR_COLORS, AVATAR_EMOJIS } from "@/lib/avatars";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  Drawing,
  emptyDrawing,
  isDrawingNonTrivial,
} from "@/lib/drawing";
import { Canvas } from "./Canvas";
import { Avatar } from "./Avatar";
import type { AvatarKind } from "@/lib/types";

// The payload the join form submits along with the avatar choice.
export interface AvatarDraft {
  kind: AvatarKind;
  color: string;
  emoji: string;
  // For DRAWING: the stringified Drawing JSON. For PHOTO: a data: URL.
  image: string | null;
}

// Face filters are vector overlays in a shared 100×100 viewBox, positioned
// over the roughly centered face in the camera preview. We ship the SVG
// inline so the overlays stay crisp at any size, don't depend on
// platform-specific emoji fonts, and can be rasterised onto the capture
// canvas at full resolution by encoding them into a data: URL and drawing
// them like any other image.
interface FaceFilter {
  id: string;
  label: string;
  /** Inner SVG markup in a 100×100 viewBox. Empty string = no overlay. */
  svg: string;
  /** CSS filter applied to the video (preview) and baked into capture. */
  cssFilter?: string;
}

const FACE_FILTERS: FaceFilter[] = [
  { id: "none", label: "Plain", svg: "" },
  {
    id: "dog",
    label: "Puppy",
    svg: `
      <path d="M 15 8 Q 6 18 10 38 Q 14 50 24 46 Q 30 35 28 18 Q 24 8 15 8 Z" fill="#8d5a2b" stroke="#3e2513" stroke-width="1.2"/>
      <path d="M 17 14 Q 12 22 15 34 Q 19 42 23 40" fill="none" stroke="#b57848" stroke-width="1.5" opacity="0.5"/>
      <path d="M 85 8 Q 94 18 90 38 Q 86 50 76 46 Q 70 35 72 18 Q 76 8 85 8 Z" fill="#8d5a2b" stroke="#3e2513" stroke-width="1.2"/>
      <path d="M 83 14 Q 88 22 85 34 Q 81 42 77 40" fill="none" stroke="#b57848" stroke-width="1.5" opacity="0.5"/>
      <ellipse cx="50" cy="58" rx="7" ry="5" fill="#0f0f0f"/>
      <ellipse cx="47" cy="55.5" rx="2" ry="1.2" fill="#ffffff" opacity="0.6"/>
      <path d="M 43 70 Q 50 82 57 70 Q 56 80 50 85 Q 44 80 43 70 Z" fill="#ff6a88" stroke="#b23c5a" stroke-width="0.7"/>
      <line x1="50" y1="74" x2="50" y2="82" stroke="#b23c5a" stroke-width="0.6" opacity="0.5"/>
    `,
    cssFilter: "contrast(1.05) saturate(1.1)",
  },
  {
    id: "cat",
    label: "Cat",
    svg: `
      <path d="M 14 4 L 30 24 L 8 22 Z" fill="#3b3b3b" stroke="#0d0d0d" stroke-width="1"/>
      <path d="M 17 9 L 26 21 L 14 20 Z" fill="#ffb0a8"/>
      <path d="M 86 4 L 70 24 L 92 22 Z" fill="#3b3b3b" stroke="#0d0d0d" stroke-width="1"/>
      <path d="M 83 9 L 74 21 L 86 20 Z" fill="#ffb0a8"/>
      <path d="M 46 50 L 54 50 L 50 55 Z" fill="#ff6a88" stroke="#b23c5a" stroke-width="0.6"/>
      <line x1="12" y1="57" x2="42" y2="55" stroke="#ffffff" stroke-width="0.9" stroke-linecap="round"/>
      <line x1="12" y1="60" x2="42" y2="58" stroke="#ffffff" stroke-width="0.9" stroke-linecap="round"/>
      <line x1="12" y1="63" x2="42" y2="61" stroke="#ffffff" stroke-width="0.9" stroke-linecap="round"/>
      <line x1="58" y1="55" x2="88" y2="57" stroke="#ffffff" stroke-width="0.9" stroke-linecap="round"/>
      <line x1="58" y1="58" x2="88" y2="60" stroke="#ffffff" stroke-width="0.9" stroke-linecap="round"/>
      <line x1="58" y1="61" x2="88" y2="63" stroke="#ffffff" stroke-width="0.9" stroke-linecap="round"/>
    `,
  },
  {
    id: "bunny",
    label: "Bunny",
    svg: `
      <g transform="rotate(-8 32 16)">
        <ellipse cx="32" cy="16" rx="6" ry="15" fill="#f1eeee" stroke="#9b9b9b" stroke-width="0.8"/>
        <ellipse cx="32" cy="16" rx="3" ry="11" fill="#ffb9c8"/>
      </g>
      <g transform="rotate(8 68 16)">
        <ellipse cx="68" cy="16" rx="6" ry="15" fill="#f1eeee" stroke="#9b9b9b" stroke-width="0.8"/>
        <ellipse cx="68" cy="16" rx="3" ry="11" fill="#ffb9c8"/>
      </g>
      <ellipse cx="50" cy="54" rx="4" ry="3" fill="#ff6a88" stroke="#b23c5a" stroke-width="0.5"/>
    `,
  },
  {
    id: "shades",
    label: "Shades",
    svg: `
      <rect x="20" y="38" width="24" height="14" rx="6" fill="#0a0a0a" stroke="#1a1a1a" stroke-width="1"/>
      <rect x="56" y="38" width="24" height="14" rx="6" fill="#0a0a0a" stroke="#1a1a1a" stroke-width="1"/>
      <line x1="44" y1="44" x2="56" y2="44" stroke="#0a0a0a" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="24" y1="41" x2="32" y2="41" stroke="#ffffff" stroke-width="1.5" opacity="0.7"/>
      <line x1="60" y1="41" x2="68" y2="41" stroke="#ffffff" stroke-width="1.5" opacity="0.7"/>
    `,
    cssFilter: "contrast(1.15) saturate(1.25)",
  },
  {
    id: "crown",
    label: "Royalty",
    svg: `
      <path d="M 20 30 L 30 15 L 40 30 L 50 10 L 60 30 L 70 15 L 80 30 L 80 37 L 20 37 Z" fill="#f9c950" stroke="#8b5a10" stroke-width="1.2"/>
      <rect x="20" y="34" width="60" height="4" fill="#d99c2b" stroke="#8b5a10" stroke-width="0.8"/>
      <circle cx="30" cy="30" r="2" fill="#ff4f7b" stroke="#7a1b2e" stroke-width="0.5"/>
      <circle cx="50" cy="26" r="2.5" fill="#6fb3ff" stroke="#1a4e85" stroke-width="0.5"/>
      <circle cx="70" cy="30" r="2" fill="#7cf8d0" stroke="#1a7a5f" stroke-width="0.5"/>
      <circle cx="48" cy="24.5" r="0.8" fill="#ffffff" opacity="0.9"/>
    `,
    cssFilter: "sepia(0.3) saturate(1.35) brightness(1.04)",
  },
  {
    id: "clown",
    label: "Clown",
    svg: `
      <circle cx="18" cy="22" r="11" fill="#ff4f7b"/>
      <circle cx="30" cy="11" r="11" fill="#ffd36e"/>
      <circle cx="42" cy="6" r="11" fill="#7cf8d0"/>
      <circle cx="58" cy="6" r="11" fill="#6fb3ff"/>
      <circle cx="70" cy="11" r="11" fill="#b080ff"/>
      <circle cx="82" cy="22" r="11" fill="#ff8a5b"/>
      <circle cx="50" cy="58" r="6.5" fill="#ff2a3d" stroke="#7a0e18" stroke-width="1"/>
      <circle cx="48" cy="56" r="1.8" fill="#ffffff" opacity="0.7"/>
    `,
  },
  {
    id: "wizard",
    label: "Wizard",
    svg: `
      <path d="M 50 0 L 22 36 L 78 36 Z" fill="#4a2e8a" stroke="#1a0a3a" stroke-width="1"/>
      <path d="M 40 18 l 1.3 4 l 4 0 l -3.3 2.5 l 1.3 4 l -3.3 -2.5 l -3.3 2.5 l 1.3 -4 l -3.3 -2.5 l 4 0 z" fill="#ffd36e"/>
      <path d="M 60 9 l 1 3 l 3 0 l -2.5 2 l 1 3 l -2.5 -2 l -2.5 2 l 1 -3 l -2.5 -2 l 3 0 z" fill="#ffd36e" opacity="0.9"/>
      <ellipse cx="50" cy="38" rx="30" ry="4" fill="#4a2e8a" stroke="#1a0a3a" stroke-width="1"/>
      <path d="M 28 70 Q 32 100 50 100 Q 68 100 72 70 Q 62 92 50 93 Q 38 92 28 70 Z" fill="#f4f4f4" stroke="#cccccc" stroke-width="0.8"/>
    `,
    cssFilter: "saturate(1.15) hue-rotate(-10deg)",
  },
  {
    id: "alien",
    label: "Alien",
    svg: `
      <ellipse cx="32" cy="48" rx="9" ry="14" fill="#050505"/>
      <ellipse cx="28" cy="42" rx="2.8" ry="4.5" fill="#ffffff" opacity="0.6"/>
      <ellipse cx="68" cy="48" rx="9" ry="14" fill="#050505"/>
      <ellipse cx="64" cy="42" rx="2.8" ry="4.5" fill="#ffffff" opacity="0.6"/>
      <line x1="42" y1="12" x2="38" y2="2" stroke="#94f08a" stroke-width="1.5" stroke-linecap="round"/>
      <circle cx="38" cy="1.5" r="2.2" fill="#94f08a"/>
      <line x1="58" y1="12" x2="62" y2="2" stroke="#94f08a" stroke-width="1.5" stroke-linecap="round"/>
      <circle cx="62" cy="1.5" r="2.2" fill="#94f08a"/>
    `,
    cssFilter: "hue-rotate(110deg) saturate(1.8) contrast(1.1)",
  },
  {
    id: "retro",
    label: "Retro",
    svg: "",
    cssFilter: "sepia(0.45) contrast(1.15) saturate(0.85) brightness(1.02)",
  },
  {
    id: "noir",
    label: "Noir",
    svg: "",
    cssFilter: "grayscale(1) contrast(1.35) brightness(0.94)",
  },
];

// Turn an SVG fragment into a data: URL the browser can load as an image.
// Used at capture time to rasterise overlays onto the photo canvas.
function svgDataUrl(inner: string, size = 256): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">${inner}</svg>`;
  // encodeURIComponent keeps things safe for `#`, `<`, spaces, etc.
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// Load an image from a data URL, resolving once it's decoded.
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

type Tab = "emoji" | "draw" | "photo";

/**
 * AvatarBuilder — the identity chooser phones see when joining a room.
 * Three tabs: pick a color+emoji, draw a tiny self-portrait, or snap a
 * selfie with a filter on top. The Draw and Photo tabs fall back to the
 * emoji tab's selection when empty so there's always a usable avatar.
 */
export function AvatarBuilder({
  value,
  onChange,
}: {
  value: AvatarDraft;
  onChange: (next: AvatarDraft) => void;
}) {
  const [tab, setTab] = useState<Tab>(value.kind === "EMOJI" ? "emoji" : value.kind === "DRAWING" ? "draw" : "photo");

  return (
    <div className="rounded-xl bg-white/5 p-3">
      <div className="flex items-center gap-3">
        <Avatar
          player={{
            avatarKind: value.kind,
            avatarColor: value.color,
            avatarEmoji: value.emoji,
            avatarImage: value.image,
          }}
          size="lg"
        />
        <div className="flex-1 text-xs text-mist/60">
          Pick your look for the big screen.
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-white/5 p-1 text-xs">
        <TabBtn active={tab === "emoji"} onClick={() => setTab("emoji")}>
          Emoji
        </TabBtn>
        <TabBtn active={tab === "draw"} onClick={() => setTab("draw")}>
          Draw
        </TabBtn>
        <TabBtn active={tab === "photo"} onClick={() => setTab("photo")}>
          Selfie
        </TabBtn>
      </div>

      <div className="mt-3">
        {tab === "emoji" && (
          <EmojiTab
            color={value.color}
            emoji={value.emoji}
            onChange={(color, emoji) =>
              onChange({ ...value, kind: "EMOJI", color, emoji, image: null })
            }
          />
        )}
        {tab === "draw" && (
          <DrawTab
            value={value.image && value.kind === "DRAWING" ? value.image : null}
            onSave={(json) =>
              onChange({ ...value, kind: "DRAWING", image: json })
            }
            onClear={() =>
              onChange({ ...value, kind: "EMOJI", image: null })
            }
          />
        )}
        {tab === "photo" && (
          <PhotoTab
            existing={value.kind === "PHOTO" ? value.image : null}
            onSave={(dataUrl) =>
              onChange({ ...value, kind: "PHOTO", image: dataUrl })
            }
            onClear={() =>
              onChange({ ...value, kind: "EMOJI", image: null })
            }
          />
        )}
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm transition ${
        active
          ? "bg-white/15 font-semibold text-mist"
          : "text-mist/70 hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

// ---------- EMOJI TAB ----------

function EmojiTab({
  color,
  emoji,
  onChange,
}: {
  color: string;
  emoji: string;
  onChange: (color: string, emoji: string) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wider text-mist/50">
        Color
      </div>
      <div className="flex flex-wrap gap-2">
        {AVATAR_COLORS.map((c) => (
          <button
            key={c.color}
            type="button"
            aria-label={`Color ${c.name}`}
            aria-pressed={color === c.color}
            onClick={() => onChange(c.color, emoji)}
            className={`h-8 w-8 rounded-full border-2 transition ${
              color === c.color ? "border-mist scale-110" : "border-white/20"
            }`}
            style={{ background: c.color }}
          />
        ))}
      </div>
      <div className="mt-3 mb-1 text-[10px] uppercase tracking-wider text-mist/50">
        Emoji
      </div>
      <div className="grid grid-cols-8 gap-1.5">
        {AVATAR_EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            aria-label={`Emoji ${e}`}
            aria-pressed={emoji === e}
            onClick={() => onChange(color, e)}
            className={`grid h-9 place-items-center rounded-lg text-lg transition ${
              emoji === e
                ? "bg-white/15 ring-1 ring-mist"
                : "bg-white/5 hover:bg-white/10"
            }`}
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- DRAW TAB ----------

function DrawTab({
  value,
  onSave,
  onClear,
}: {
  value: string | null;
  onSave: (json: string) => void;
  onClear: () => void;
}) {
  // Seed the canvas from saved JSON when re-entering the tab.
  const [drawing, setDrawing] = useState<Drawing>(() => {
    if (!value) return emptyDrawing();
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && Array.isArray(parsed.s)) {
        return parsed as Drawing;
      }
    } catch {
      // fall through
    }
    return emptyDrawing();
  });

  function commit(next: Drawing) {
    setDrawing(next);
    if (isDrawingNonTrivial(next)) {
      onSave(JSON.stringify(next));
    } else {
      // Treat a blank canvas as "no drawing" — fall back to emoji.
      onClear();
    }
  }

  return (
    <div>
      <p className="mb-2 text-xs text-mist/60">
        Sketch yourself. A few strokes is plenty — it shows on the TV.
      </p>
      <Canvas value={drawing} onChange={commit} />
    </div>
  );
}

// ---------- PHOTO TAB ----------

function PhotoTab({
  existing,
  onSave,
  onClear,
}: {
  existing: string | null;
  onSave: (dataUrl: string) => void;
  onClear: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<
    "idle" | "requesting" | "live" | "captured" | "denied" | "unsupported"
  >(existing ? "captured" : "idle");
  const [filterId, setFilterId] = useState<string>("dog");
  const [error, setError] = useState<string | null>(null);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(existing);

  const filter = FACE_FILTERS.find((f) => f.id === filterId) ?? FACE_FILTERS[0];

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startStream = useCallback(async () => {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState("unsupported");
      return;
    }
    setState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 480 },
          height: { ideal: 480 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => {
          // Some browsers require a user gesture — we already have one.
        });
      }
      setState("live");
    } catch (err) {
      console.warn("getUserMedia failed:", err);
      setState("denied");
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't open the camera. Check your browser permissions."
      );
    }
  }, []);

  // Clean up the camera when this tab unmounts or the user captures.
  useEffect(() => {
    return () => stopStream();
  }, [stopStream]);

  useEffect(() => {
    if (state !== "live") {
      // No active preview — ensure any stream is released.
      stopStream();
    }
  }, [state, stopStream]);

  async function capture() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Preview is mirrored via CSS — bake the mirror into the exported
    // image so the saved photo matches what the user was seeing.
    ctx.save();
    ctx.translate(size, 0);
    ctx.scale(-1, 1);
    // Cover-fit the square: crop the central portion of the (often wider)
    // camera frame.
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const scale = Math.max(size / vw, size / vh);
    const drawW = vw * scale;
    const drawH = vh * scale;
    const dx = (size - drawW) / 2;
    const dy = (size - drawH) / 2;
    if (filter.cssFilter) ctx.filter = filter.cssFilter;
    ctx.drawImage(video, dx, dy, drawW, drawH);
    ctx.restore();
    ctx.filter = "none";

    // Rasterise the SVG overlay and draw it on top, unmirrored, at full
    // resolution. Skipped when the filter is a pure CSS effect (e.g.
    // Plain, Retro, Noir) and has nothing to overlay.
    if (filter.svg && filter.svg.trim().length > 0) {
      try {
        const img = await loadImage(svgDataUrl(filter.svg, size));
        ctx.drawImage(img, 0, 0, size, size);
      } catch (err) {
        console.warn("Overlay rasterisation failed:", err);
      }
    }

    const url = canvas.toDataURL("image/jpeg", 0.78);
    setCapturedUrl(url);
    onSave(url);
    stopStream();
    setState("captured");
  }

  function retake() {
    setCapturedUrl(null);
    onClear();
    startStream();
  }

  return (
    <div>
      {state === "idle" && (
        <div className="space-y-2">
          <p className="text-xs text-mist/60">
            Snap a selfie with a filter on top. Camera access only happens
            when you tap below.
          </p>
          <button
            type="button"
            onClick={startStream}
            className="cc-btn-primary w-full"
          >
            Open camera
          </button>
        </div>
      )}

      {(state === "requesting" || state === "live") && (
        <div className="space-y-3">
          <div className="relative mx-auto aspect-square w-full max-w-[320px] overflow-hidden rounded-2xl border border-white/10 bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-full w-full object-cover"
              style={{
                transform: "scaleX(-1)",
                filter: filter.cssFilter,
              }}
            />
            {/* SVG overlay positioned in the same 100×100 face grid used
                during capture. When the filter has no overlay (Plain /
                Retro / Noir) we skip rendering this layer entirely. */}
            {filter.svg && (
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="xMidYMid meet"
                className="pointer-events-none absolute inset-0 h-full w-full"
                aria-hidden
                dangerouslySetInnerHTML={{ __html: filter.svg }}
              />
            )}
            {state === "requesting" && (
              <div className="absolute inset-0 grid place-items-center bg-black/60 text-sm text-mist/80">
                Waking up the camera…
              </div>
            )}
          </div>

          <div className="-mx-1 flex gap-1.5 overflow-x-auto pb-1">
            {FACE_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilterId(f.id)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs transition ${
                  filterId === f.id
                    ? "border-ember bg-ember/20 text-ember"
                    : "border-white/15 bg-white/5 text-mist/70"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={capture}
            disabled={state !== "live"}
            className="cc-btn-primary w-full"
          >
            Capture
          </button>
        </div>
      )}

      {state === "captured" && capturedUrl && (
        <div className="space-y-3">
          <div className="mx-auto grid aspect-square w-full max-w-[240px] place-items-center overflow-hidden rounded-2xl border border-white/10 bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={capturedUrl}
              alt="Your selfie avatar"
              className="h-full w-full object-cover"
              draggable={false}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={retake}
              className="cc-btn-ghost flex-1"
            >
              Retake
            </button>
            <button
              type="button"
              onClick={onClear}
              className="cc-btn-ghost flex-1"
            >
              Use emoji instead
            </button>
          </div>
        </div>
      )}

      {state === "denied" && (
        <div className="space-y-2 rounded-xl border border-ember/40 bg-ember/10 p-3 text-sm text-ember">
          <div>{error ?? "Camera permission was denied."}</div>
          <button
            type="button"
            onClick={() => setState("idle")}
            className="cc-btn-ghost w-full"
          >
            Try again
          </button>
        </div>
      )}

      {state === "unsupported" && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-mist/70">
          Your browser can&apos;t access the camera here. Try the Draw or
          Emoji tab instead.
        </div>
      )}
    </div>
  );
}

// Re-export the drawing bounds so InlineJoin / tests can import the same
// numbers the Canvas uses internally.
export const AVATAR_DRAW_SIZE = { width: CANVAS_WIDTH, height: CANVAS_HEIGHT };
