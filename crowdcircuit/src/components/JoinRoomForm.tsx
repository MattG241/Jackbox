"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveSession } from "@/lib/session";
import { AVATAR_COLORS, AVATAR_EMOJIS } from "@/lib/avatars";
import { AvatarPicker } from "./AvatarPicker";

export function JoinRoomForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
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
    const normalized = code.trim().toUpperCase();
    setBusy(true);
    try {
      const res = await fetch(`/api/rooms/${normalized}/join`, {
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
      router.push(`/play/${normalized}`);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="cc-card p-5">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-neon">Join a room</div>
      <label htmlFor="code" className="mb-1 block text-sm text-mist/70">
        Room code
      </label>
      <input
        id="code"
        className="cc-input tracking-[0.4em] uppercase"
        placeholder="XXXX"
        maxLength={4}
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        required
      />
      <label htmlFor="displayName" className="mb-1 mt-3 block text-sm text-mist/70">
        Display name
      </label>
      <input
        id="displayName"
        className="cc-input"
        placeholder="e.g. Reckless"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        maxLength={20}
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
        disabled={busy || code.length !== 4 || displayName.trim().length === 0}
        className="cc-btn-primary mt-4 w-full"
      >
        {busy ? "Joining…" : "Join"}
      </button>
    </form>
  );
}
