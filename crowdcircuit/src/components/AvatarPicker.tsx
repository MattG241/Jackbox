"use client";

import { AVATAR_COLORS, AVATAR_EMOJIS } from "@/lib/avatars";

interface AvatarPickerProps {
  color: string;
  emoji: string;
  onColor: (c: string) => void;
  onEmoji: (e: string) => void;
}

export function AvatarPicker({ color, emoji, onColor, onEmoji }: AvatarPickerProps) {
  return (
    <div className="rounded-xl bg-white/5 p-3">
      <div className="flex items-center gap-3">
        <div
          className="grid h-14 w-14 shrink-0 place-items-center rounded-full text-2xl"
          style={{ background: color }}
          aria-hidden
        >
          {emoji}
        </div>
        <div className="flex-1 text-xs text-mist/60">
          Pick a color and emoji — this is your lobby look on the big screen.
        </div>
      </div>
      <div className="mt-3">
        <div className="mb-1 text-xs uppercase tracking-wider text-mist/50">Color</div>
        <div className="flex flex-wrap gap-2">
          {AVATAR_COLORS.map((c) => (
            <button
              key={c.color}
              type="button"
              aria-label={`Color ${c.name}`}
              aria-pressed={color === c.color}
              onClick={() => onColor(c.color)}
              className={`h-8 w-8 rounded-full border-2 transition ${
                color === c.color ? "border-mist scale-110" : "border-white/20"
              }`}
              style={{ background: c.color }}
            />
          ))}
        </div>
      </div>
      <div className="mt-3">
        <div className="mb-1 text-xs uppercase tracking-wider text-mist/50">Emoji</div>
        <div className="grid grid-cols-8 gap-1.5">
          {AVATAR_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              aria-label={`Emoji ${e}`}
              aria-pressed={emoji === e}
              onClick={() => onEmoji(e)}
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
    </div>
  );
}
