"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loadSession, saveSession } from "@/lib/session";
import { useLiveRoom } from "@/components/useLiveRoom";
import { RemoteView } from "@/components/RemoteView";

/**
 * /remote/[code]?t=TOKEN — TV-paired phone controller.
 *
 * If a remote session is already in localStorage for this room, resume it.
 * Otherwise exchange the `t` query parameter for a remote session via the
 * HTTP endpoint, then attach to the live room.
 */
export default function RemotePage({ params }: { params: { code: string } }) {
  // useSearchParams in the app router requires a Suspense boundary so the
  // page can stream correctly when prerendered.
  return (
    <Suspense fallback={<PairingFallback />}>
      <RemotePageInner code={params.code.toUpperCase()} />
    </Suspense>
  );
}

function PairingFallback() {
  return (
    <main className="grid min-h-screen place-items-center">
      <div className="cc-chip">
        <span className="h-1.5 w-1.5 animate-pulseSoft rounded-full bg-neon" />
        Pairing remote…
      </div>
    </main>
  );
}

function RemotePageInner({ code }: { code: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const existing = loadSession(code);
    if (existing?.isRemote) {
      setReady(true);
      return;
    }
    const token = searchParams.get("t");
    if (!token) {
      setError(
        "This link is missing its pairing token. Re-scan the Remote QR on the TV."
      );
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/rooms/${code}/remote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const text = await res.text();
        let json: { session?: unknown; error?: unknown } = {};
        try {
          json = text ? JSON.parse(text) : {};
        } catch {
          setError(
            `Server returned ${res.status}. ${text.slice(0, 160) || "Empty response."}`
          );
          return;
        }
        if (!res.ok) {
          setError(
            typeof json.error === "string"
              ? json.error
              : `Couldn't pair remote (${res.status}).`
          );
          return;
        }
        saveSession(json.session as never);
        setReady(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error.");
      }
    })();
  }, [code, searchParams]);

  if (error) {
    return (
      <main className="mx-auto grid min-h-screen max-w-md place-items-center px-6 text-center">
        <div className="cc-card p-6">
          <div className="text-lg font-semibold text-ember">Remote not paired</div>
          <p className="mt-2 text-sm text-mist/70">{error}</p>
          <button
            onClick={() => router.push("/")}
            className="cc-btn-ghost mt-4"
          >
            Back to home
          </button>
        </div>
      </main>
    );
  }
  if (!ready) {
    return (
      <main className="grid min-h-screen place-items-center">
        <div className="cc-chip">
          <span className="h-1.5 w-1.5 animate-pulseSoft rounded-full bg-neon" />
          Pairing remote…
        </div>
      </main>
    );
  }
  return <RemoteInner code={code} />;
}

function RemoteInner({ code }: { code: string }) {
  useLiveRoom(code);
  return <RemoteView />;
}
