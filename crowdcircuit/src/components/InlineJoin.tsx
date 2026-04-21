"use client";

import { useState } from "react";
import { saveSession } from "@/lib/session";
import { AVATAR_COLORS, AVATAR_EMOJIS } from "@/lib/avatars";
import { AvatarPicker } from "./AvatarPicker";

/**
 * InlineJoin — shown on /play/[code] when the phone doesn't yet have a
 * session for this room. The room code comes from the URL (the QR code), so
 * the player only has to pick a name + avatar and tap Join. On success we
 * save the session and tell the parent page to flip into live-room mode.
 */
export function InlineJoin({
  code,
  onJoined,
}: {
  code: string;
  onJoined: () => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [asAudience, setAsAudience] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audienceOffered, setAudienceOffered] = useState(false);
  const [avatarColor, setAvatarColor] = useState(
    AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)].color
  );
  const [avatarEmoji, setAvatarEmoji] = useState(
    AVATAR_EMOJIS[Math.floor(Math.random() * AVATAR_EMOJIS.length)]
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAudienceOffered(false);
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/rooms/${code}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, asAudience, avatarColor, avatarEmoji }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "Couldn't join.");
        if (json.audienceAvailable) setAudienceOffered(true);
        return;
      }
      saveSession(json.session);
      onJoined();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col gap-4 px-4 py-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-ember shadow-[0_0_16px_rgba(255,79,123,0.5)]">
            <span className="font-display text-base font-bold">C</span>
          </div>
          <div className="flex flex-col">
            <span className="font-display text-base font-semibold">CrowdCircuit</span>
            <span className="text-xs text-mist/60">Joining a room</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-mist/60">Room</div>
          <div className="font-mono text-base tracking-[0.35em] text-neon">{code}</div>
        </div>
      </header>

      <form onSubmit={submit} className="cc-card p-5">
        <h2 className="text-xl font-semibold">You&apos;re almost in.</h2>
        <p className="mt-1 text-sm text-mist/70">
          Pick how you show up on the big screen. No code to retype — you&apos;re
          already at room <span className="font-mono text-neon">{code}</span>.
        </p>
        <label htmlFor="displayName" className="mt-4 mb-1 block text-sm text-mist/70">
          Display name
        </label>
        <input
          id="displayName"
          className="cc-input text-base"
          placeholder="e.g. Reckless"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={20}
          autoFocus
          required
        />
        <div className="mt-3">
          <AvatarPicker
            color={avatarColor}
            emoji={avatarEmoji}
            onColor={setAvatarColor}
            onEmoji={setAvatarEmoji}
          />
        </div>
        <label className="mt-3 flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={asAudience}
            onChange={(e) => setAsAudience(e.target.checked)}
          />
          Join as audience (vote only)
        </label>
        {error && (
          <div role="alert" className="mt-3 text-sm text-ember">
            {error}
            {audienceOffered && !asAudience && (
              <button
                type="button"
                className="ml-2 underline"
                onClick={() => setAsAudience(true)}
              >
                Join as audience instead
              </button>
            )}
          </div>
        )}
        <button
          type="submit"
          disabled={busy || displayName.trim().length === 0}
          className="cc-btn-primary mt-4 w-full py-4 text-base"
        >
          {busy ? "Joining…" : "Enter the lobby"}
        </button>
      </form>
    </main>
  );
}
