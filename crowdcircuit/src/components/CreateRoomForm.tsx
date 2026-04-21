"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveRemoteToken } from "@/lib/session";

// CreateRoomForm is the "set up a new lobby" card on the landing page.
// It no longer asks for a host name or avatar — the TV is display-only
// and the first phone to scan the join QR becomes the room's host (and
// still plays normally). Family/streamer toggles are the only options
// worth setting at creation; both can still be flipped from the in-room
// remote if plans change.
export function CreateRoomForm() {
  const router = useRouter();
  const [familyMode, setFamilyMode] = useState(false);
  const [streamerMode, setStreamerMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familyMode, streamerMode }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "Couldn't create room.");
        return;
      }
      if (json.code && json.remoteToken) {
        saveRemoteToken(json.code, json.remoteToken);
      }
      router.push(`/host/${json.code}`);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="cc-card p-5">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-ember">
        Start a room
      </div>
      <p className="text-sm text-mist/70">
        Open a new lobby on this device. The first person to scan the join QR
        becomes the host &mdash; and still plays.
      </p>
      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        <label className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
          <input
            type="checkbox"
            checked={familyMode}
            onChange={(e) => setFamilyMode(e.target.checked)}
          />
          Family mode
        </label>
        <label className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
          <input
            type="checkbox"
            checked={streamerMode}
            onChange={(e) => setStreamerMode(e.target.checked)}
          />
          Streamer mode
        </label>
      </div>
      {error && (
        <div role="alert" className="mt-3 text-sm text-ember">
          {error}
        </div>
      )}
      <button type="submit" disabled={busy} className="cc-btn-primary mt-4 w-full">
        {busy ? "Spinning up…" : "Create room"}
      </button>
    </form>
  );
}
