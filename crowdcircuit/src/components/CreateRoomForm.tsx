"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveSession } from "@/lib/session";

export function CreateRoomForm() {
  const router = useRouter();
  const [hostName, setHostName] = useState("");
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
        body: JSON.stringify({ hostName, familyMode, streamerMode }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "Couldn't create room.");
        return;
      }
      saveSession(json.session);
      router.push(`/host/${json.code}`);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="cc-card p-5">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-ember">Host a room</div>
      <label htmlFor="hostName" className="mb-1 block text-sm text-mist/70">
        Your display name
      </label>
      <input
        id="hostName"
        className="cc-input"
        placeholder="e.g. Ophelia"
        value={hostName}
        onChange={(e) => setHostName(e.target.value)}
        maxLength={20}
        required
      />
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
      <button type="submit" disabled={busy || hostName.trim().length === 0} className="cc-btn-primary mt-4 w-full">
        {busy ? "Spinning up…" : "Create room"}
      </button>
    </form>
  );
}
