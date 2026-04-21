"use client";

import { useEffect, useState } from "react";
import { HostView } from "@/components/HostView";
import { useDisplayRoom } from "@/components/useDisplayRoom";
import { saveRemoteToken } from "@/lib/session";

// Browser-scoped memory of "the TV room I last opened." When the owner
// refreshes the landing page we resume that room if it's still around,
// otherwise we spin up a fresh one.
const TV_ROOM_KEY = "cc:tvRoom";

type PageState =
  | { kind: "loading" }
  | { kind: "room"; code: string }
  | { kind: "error"; message: string };

/**
 * Root URL is the lobby. No marketing, no forms — opening the site on a
 * TV (or any shared display) gets you a room with a single QR code ready
 * to scan. Phones scan the QR and land on `/play/[code]` where they
 * join; the first non-audience joiner is promoted to host server-side.
 */
export default function LandingPage() {
  const [state, setState] = useState<PageState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Try to resume a previously-created room for this browser first,
      // so a page reload keeps the QR + code the players already scanned.
      const cached =
        typeof window !== "undefined" ? localStorage.getItem(TV_ROOM_KEY) : null;
      if (cached) {
        const alive = await checkRoomExists(cached);
        if (cancelled) return;
        if (alive) {
          setState({ kind: "room", code: cached });
          return;
        }
        // Cached room is gone — clear it and fall through to create a new one.
        localStorage.removeItem(TV_ROOM_KEY);
      }

      try {
        const res = await fetch("/api/rooms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const json = await res.json();
        if (!res.ok) {
          const reason =
            typeof json.error === "string"
              ? json.error
              : `Couldn't start a lobby (${res.status}).`;
          if (!cancelled) setState({ kind: "error", message: reason });
          return;
        }
        if (cancelled) return;
        if (typeof window !== "undefined") {
          localStorage.setItem(TV_ROOM_KEY, json.code);
        }
        if (json.remoteToken) saveRemoteToken(json.code, json.remoteToken);
        setState({ kind: "room", code: json.code });
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Network error.";
        setState({ kind: "error", message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === "loading") {
    return (
      <main className="grid h-[100dvh] place-items-center overflow-hidden">
        <div className="cc-chip">
          <span className="h-1.5 w-1.5 animate-pulseSoft rounded-full bg-neon" />
          Opening a lobby…
        </div>
      </main>
    );
  }

  if (state.kind === "error") {
    return (
      <main className="grid h-[100dvh] place-items-center px-6 text-center">
        <div className="cc-card max-w-md p-6">
          <div className="text-lg font-semibold text-ember">
            Couldn&apos;t start a lobby
          </div>
          <p className="mt-2 text-sm text-mist/70">{state.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="cc-btn-primary mt-4 w-full"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  return <LiveLobby code={state.code} />;
}

function LiveLobby({ code }: { code: string }) {
  useDisplayRoom(code);
  return <HostView />;
}

async function checkRoomExists(code: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/rooms/${code}`, { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}
