"use client";

import { useCallback, useEffect, useState } from "react";

// Browsers require a user gesture to enter fullscreen — a raw
// `requestFullscreen()` on page load is blocked. This component
// (a) arms a one-shot click/keydown listener that flips the document
// into fullscreen on the first interaction, and (b) shows a corner pill
// that prompts you to enter (or re-enter) fullscreen, so exiting via
// Escape doesn't trap the TV in windowed mode.
export function AutoFullscreen() {
  const [isFs, setIsFs] = useState(false);
  const [supported, setSupported] = useState(true);

  // Keep `isFs` in sync with the actual document state. The browser can
  // leave fullscreen from user action (Escape) at any time.
  useEffect(() => {
    const onChange = () => {
      setIsFs(document.fullscreenElement != null);
    };
    setSupported(typeof document.documentElement.requestFullscreen === "function");
    setIsFs(document.fullscreenElement != null);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const enter = useCallback(async () => {
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // Silently fail — user gesture was probably missing or the browser
      // denied it. We'll keep the pill visible so they can tap it.
    }
  }, []);

  // Arm a one-shot listener for the first user interaction. Entering
  // fullscreen on the first tap/keypress is the friendliest "default to
  // fullscreen" behaviour given the browser's gesture requirement.
  useEffect(() => {
    if (!supported || isFs) return;
    const tryEnter = () => {
      enter();
      removeListeners();
    };
    const removeListeners = () => {
      window.removeEventListener("pointerdown", tryEnter);
      window.removeEventListener("keydown", tryEnter);
    };
    window.addEventListener("pointerdown", tryEnter, { once: true });
    window.addEventListener("keydown", tryEnter, { once: true });
    return removeListeners;
  }, [enter, isFs, supported]);

  // Once we're fullscreen the TV has a clean canvas — the pill is hidden.
  // If the user presses Escape, `isFs` flips back to false and the pill
  // reappears so they can tap to re-enter.
  if (!supported || isFs) return null;

  return (
    <button
      type="button"
      onClick={enter}
      className="fixed right-3 top-3 z-50 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/60 px-3 py-1 text-[11px] uppercase tracking-[0.25em] text-mist/70 transition hover:bg-black/80"
      aria-label="Enter fullscreen"
    >
      <span aria-hidden>⛶</span>
      <span>Tap for fullscreen</span>
    </button>
  );
}
