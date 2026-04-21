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
      const json = await res.json();
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "Couldn't start TV lobby.");
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
