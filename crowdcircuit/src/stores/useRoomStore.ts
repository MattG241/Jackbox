"use client";

import { create } from "zustand";
import type { RoomSnapshot, SessionHandshake } from "@/lib/types";

interface RoomState {
  session: SessionHandshake | null;
  snapshot: RoomSnapshot | null;
  connected: boolean;
  setSession: (s: SessionHandshake | null) => void;
  setSnapshot: (s: RoomSnapshot) => void;
  setConnected: (c: boolean) => void;
}

export const useRoomStore = create<RoomState>((set) => ({
  session: null,
  snapshot: null,
  connected: false,
  setSession: (session) => set({ session }),
  setSnapshot: (snapshot) => set({ snapshot }),
  setConnected: (connected) => set({ connected }),
}));
