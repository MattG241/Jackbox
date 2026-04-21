"use client";

import type { SessionHandshake } from "@/lib/types";

const key = (code: string) => `cc:session:${code.toUpperCase()}`;
const remoteKey = (code: string) => `cc:remote:${code.toUpperCase()}`;

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

// The TV stores the room's remote token locally so it can render the
// "Host remote" QR on reload without re-authenticating.
export function saveRemoteToken(roomCode: string, token: string) {
  try {
    localStorage.setItem(remoteKey(roomCode), token);
  } catch {}
}

export function loadRemoteToken(roomCode: string): string | null {
  try {
    return localStorage.getItem(remoteKey(roomCode));
  } catch {
    return null;
  }
}

export function clearRemoteToken(roomCode: string) {
  try {
    localStorage.removeItem(remoteKey(roomCode));
  } catch {}
}
