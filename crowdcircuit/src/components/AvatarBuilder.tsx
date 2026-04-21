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

// Dog / cat / party accessories. Each filter is a list of overlay layers
// positioned on a 100×100 grid relative to a centered face. Emojis are a
// pragmatic shortcut — they render at consistent sizes cross-platform and
// don't require bundling any image assets.
interface Overlay {
  emoji: string;
  /** Center x% of the face box. */
  x: number;
  /** Center y% of the face box. */
  y: number;
  size: number; // em
  rotate?: number;
}

interface FaceFilter {
  id: string;
  label: string;
  overlays: Overlay[];
  /** Optional CSS filter applied to the captured photo. */
  cssFilter?: string;
}

const FACE_FILTERS: FaceFilter[] = [
  { id: "none", label: "Plain", overlays: [] },
  {
    id: "dog",
    label: "Dog",
    overlays: [
      { emoji: "🐶", x: 20, y: 10, size: 3.2, rotate: -18 },
      { emoji: "🐶", x: 80, y: 10, size: 3.2, rotate: 18 },
      { emoji: "👃", x: 50, y: 58, size: 2.2 },
      { emoji: "👅", x: 50, y: 78, size: 2.2 },
    ],
  },
  {
    id: "cat",
    label: "Cat",
    overlays: [
      { emoji: "🐱", x: 22, y: 8, size: 2.6, rotate: -20 },
      { emoji: "🐱", x: 78, y: 8, size: 2.6, rotate: 20 },
      { emoji: "🐾", x: 30, y: 62, size: 1.3 },
      { emoji: "🐾", x: 70, y: 62, size: 1.3 },
    ],
  },
  {
    id: "bunny",
    label: "Bunny",
    overlays: [
      { emoji: "🐰", x: 25, y: 2, size: 3.4, rotate: -8 },
      { emoji: "🐰", x: 75, y: 2, size: 3.4, rotate: 8 },
    ],
  },
  {
    id: "shades",
    label: "Shades",
    overlays: [{ emoji: "🕶️", x: 50, y: 40, size: 4.5 }],
    cssFilter: "contrast(1.1) saturate(1.2)",
  },
  {
    id: "clown",
    label: "Clown",
    overlays: [
      { emoji: "🤡", x: 50, y: 58, size: 2.6 },
      { emoji: "🎈", x: 15, y: 20, size: 2 },
      { emoji: "🎈", x: 85, y: 20, size: 2 },
    ],
  },
  {
    id: "crown",
    label: "Royalty",
    overlays: [{ emoji: "👑", x: 50, y: 5, size: 3.5 }],
    cssFilter: "sepia(0.25) saturate(1.3)",
  },
  {
    id: "alien",
    label: "Alien",
    overlays: [{ emoji: "👽", x: 50, y: 50, size: 6 }],
    cssFilter: "hue-rotate(200deg) saturate(1.6)",
  },
];

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

  function capture() {
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

    // Overlay pass — draw the emojis on top using the same layout as the
    // live preview. Unmirrored here so the emoji orientation is correct.
    for (const o of filter.overlays) {
      ctx.save();
      const px = (o.x / 100) * size;
      const py = (o.y / 100) * size;
      ctx.translate(px, py);
      if (o.rotate) ctx.rotate((o.rotate * Math.PI) / 180);
      const fontPx = o.size * 16; // 1em ≈ 16px
      ctx.font = `${fontPx}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(o.emoji, 0, 0);
      ctx.restore();
    }

    const url = canvas.toDataURL("image/jpeg", 0.72);
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
            {/* Overlay emojis positioned on a 100×100 face grid. */}
            <div className="pointer-events-none absolute inset-0">
              {filter.overlays.map((o, i) => (
                <span
                  key={i}
                  className="absolute"
                  style={{
                    left: `${o.x}%`,
                    top: `${o.y}%`,
                    transform: `translate(-50%, -50%) rotate(${o.rotate ?? 0}deg)`,
                    fontSize: `${o.size}em`,
                    lineHeight: 1,
                  }}
                >
                  {o.emoji}
                </span>
              ))}
            </div>
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
