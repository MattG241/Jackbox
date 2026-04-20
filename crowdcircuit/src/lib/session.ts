"use client";

import type { SessionHandshake } from "@/lib/types";

const key = (code: string) => `cc:session:${code.toUpperCase()}`;

export function saveSession(session: SessionHandshake) {
  try {
    localStorage.setItem(key(session.roomCode), JSON.stringify(session));
  } catch {}
}

export function loadSession(roomCode: string): SessionHandshake | null {
  try {
    const raw = localStorage.getItem(key(roomCode));
    if (!raw) return null;
    return JSON.parse(raw) as SessionHandshake;
  } catch {
    return null;
  }
}

export function clearSession(roomCode: string) {
  try {
    localStorage.removeItem(key(roomCode));
  } catch {}
}
