"use client";

import type { AvatarKind, PublicPlayer } from "@/lib/types";
import { DrawingView, tryParseDrawing } from "./DrawingView";

// Minimal shape needed to render an avatar. Using a narrow type means we
// can render both PublicPlayer records (from room state) and in-progress
// previews built client-side without forcing every caller to invent a
// player id / score.
export interface AvatarLike {
  avatarKind?: AvatarKind | null;
  avatarColor?: string | null;
  avatarEmoji?: string | null;
  avatarImage?: string | null;
}

const SIZE_PX: Record<string, number> = {
  xs: 20,
  sm: 28,
  md: 40,
  lg: 64,
  xl: 96,
  "2xl": 128,
};

/**
 * Renders a player's avatar in one of three modes. Callers just pass a
 * player-shaped object; the component picks EMOJI / DRAWING / PHOTO and
 * handles broken data by falling back to the emoji path.
 */
export function Avatar({
  player,
  size = "md",
  className = "",
  rounded = true,
}: {
  player: AvatarLike;
  size?: keyof typeof SIZE_PX;
  className?: string;
  rounded?: boolean;
}) {
  const px = SIZE_PX[size] ?? SIZE_PX.md;
  const kind: AvatarKind = (player.avatarKind as AvatarKind) || "EMOJI";
  const round = rounded ? "rounded-full" : "rounded-xl";

  if (kind === "PHOTO" && player.avatarImage) {
    return (
      <span
        className={`relative inline-block shrink-0 overflow-hidden border border-white/10 ${round} ${className}`}
        style={{ width: px, height: px }}
        aria-hidden
      >
        {/* Using a plain <img> so data: URLs render without Next's image
            loader getting in the way. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={player.avatarImage}
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
        />
      </span>
    );
  }

  if (kind === "DRAWING" && player.avatarImage) {
    const drawing = tryParseDrawing(player.avatarImage);
    if (drawing) {
      return (
        <span
          className={`relative inline-flex shrink-0 items-center justify-center border border-white/10 bg-white/5 ${round} ${className}`}
          style={{ width: px, height: px }}
          aria-hidden
        >
          <span className="block h-[85%] w-[85%]">
            <DrawingView drawing={drawing} />
          </span>
        </span>
      );
    }
    // Fallthrough to emoji if the blob failed to parse.
  }

  // EMOJI (default) — colored circle with the emoji centered. Font size
  // scales with pixel size so the emoji fills the circle without overflow.
  return (
    <span
      className={`inline-grid shrink-0 place-items-center ${round} ${className}`}
      style={{
        width: px,
        height: px,
        background: player.avatarColor ?? "#ff4f7b",
        fontSize: Math.round(px * 0.55),
        lineHeight: 1,
      }}
      aria-hidden
    >
      {player.avatarEmoji ?? "🎲"}
    </span>
  );
}

// Convenience alias when you only have a PublicPlayer and don't want to
// remember the avatar-prop shape.
export function PlayerAvatar({
  player,
  size = "md",
  className,
  rounded,
}: {
  player: PublicPlayer;
  size?: keyof typeof SIZE_PX;
  className?: string;
  rounded?: boolean;
}) {
  return (
    <Avatar
      player={player}
      size={size}
      className={className}
      rounded={rounded}
    />
  );
}
