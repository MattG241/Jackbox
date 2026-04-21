"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Loops /background.mp3 on the TV. Attempts autoplay on mount; browsers that
 * block autoplay without a gesture get a corner "tap to play" prompt. A small
 * mute toggle is exposed so the host can hush the TV without reaching for the
 * remote's volume.
 */
export function BackgroundMusic({
  src = "/background.mp3",
  defaultVolume = 0.35,
}: {
  src?: string;
  defaultVolume?: number;
}) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [needsGesture, setNeedsGesture] = useState(false);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;
    audio.volume = defaultVolume;
    const tryPlay = async () => {
      try {
        await audio.play();
        setNeedsGesture(false);
      } catch {
        setNeedsGesture(true);
      }
    };
    void tryPlay();
  }, [defaultVolume]);

  async function resume() {
    const audio = ref.current;
    if (!audio) return;
    try {
      audio.muted = false;
      setMuted(false);
      await audio.play();
      setNeedsGesture(false);
    } catch {
      // Still blocked — leave the overlay up.
    }
  }

  function toggleMute() {
    const audio = ref.current;
    if (!audio) return;
    const next = !muted;
    audio.muted = next;
    setMuted(next);
  }

  return (
    <>
      <audio ref={ref} src={src} loop preload="auto" playsInline />
      {needsGesture && (
        <button
          type="button"
          onClick={resume}
          className="fixed inset-0 z-50 grid place-items-center bg-ink/80 text-mist backdrop-blur-sm"
          aria-label="Tap to start background music"
        >
          <div className="cc-card max-w-md p-8 text-center">
            <div className="text-4xl">🔊</div>
            <div className="mt-4 text-2xl font-semibold">Tap to start music</div>
            <div className="mt-2 text-sm text-mist/60">
              Your browser blocked autoplay. One tap and we're in.
            </div>
          </div>
        </button>
      )}
      {!needsGesture && (
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? "Unmute music" : "Mute music"}
          className="fixed bottom-5 right-5 z-40 grid h-12 w-12 place-items-center rounded-full bg-black/40 text-xl backdrop-blur hover:bg-black/60"
          title={muted ? "Unmute music" : "Mute music"}
        >
          {muted ? "🔇" : "🎵"}
        </button>
      )}
    </>
  );
}
