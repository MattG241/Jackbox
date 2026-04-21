"use client";

import { useEffect, useState } from "react";
import { PlayerView } from "@/components/PlayerView";
import { InlineJoin } from "@/components/InlineJoin";
import { useLiveRoom } from "@/components/useLiveRoom";
import { loadSession } from "@/lib/session";

/**
 * /play/[code] — the phone's landing page for a room.
 *
 * On first scan of the join QR code the player lands here with no session
 * stored locally, so we show the inline join form (name + avatar only; the
 * room code is carried in the URL — no retyping). Once joined, we flip to
 * the live PlayerView and connect over socket.io.
 */
export default function PlayPage({ params }: { params: { code: string } }) {
  const code = params.code.toUpperCase();
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  // Check localStorage on mount. We can't do this during render because
  // localStorage doesn't exist during SSR.
  useEffect(() => {
    setHasSession(!!loadSession(code));
  }, [code]);

  if (hasSession === null) {
    return (
      <main className="grid min-h-[100dvh] place-items-center">
        <div className="cc-chip">
          <span className="h-1.5 w-1.5 animate-pulseSoft rounded-full bg-neon" />
          Opening room {code}…
        </div>
      </main>
    );
  }

  if (!hasSession) {
    return <InlineJoin code={code} onJoined={() => setHasSession(true)} />;
  }

  return <LiveRoom code={code} />;
}

function LiveRoom({ code }: { code: string }) {
  useLiveRoom(code);
  return <PlayerView />;
}
