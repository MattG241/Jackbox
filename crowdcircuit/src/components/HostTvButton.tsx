"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveSession } from "@/lib/session";

export function HostTvButton({
  className,
  label = "Host on this TV (scan to join)",
}: {
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostIsAudience: true }),
      });
      const text = await res.text();
      let json: { code?: string; session?: unknown; error?: unknown } = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        // Non-JSON response (usually an HTML error page from the server).
        setError(
          `Server returned ${res.status}. ${text.slice(0, 160) || "Empty response."}`
        );
        return;
      }
      if (!res.ok) {
        const reason =
          typeof json.error === "string" ? json.error : `Request failed (${res.status}).`;
        setError(reason);
        return;
      }
      saveSession(json.session as never);
      router.push(`/host/${json.code}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error.";
      setError(`Network error: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <button onClick={go} disabled={busy} className="cc-btn-primary w-full text-lg">
        {busy ? "Starting lobby…" : label}
      </button>
      {error && (
        <div role="alert" className="mt-2 text-sm text-ember">
          {error}
        </div>
      )}
    </div>
  );
}
