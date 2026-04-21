"use client";

import { useEffect, useRef } from "react";
import { clearSession, loadSession } from "@/lib/session";
import { getSocket } from "@/lib/socketClient";
import type { RoomSnapshot } from "@/lib/types";
import { useRoomStore } from "@/stores/useRoomStore";

// Hook that wires a page to a live room: resumes the session, listens for
// snapshots, and handles reconnect feedback. If no session is stored locally
// the hook is a no-op — the page is responsible for rendering the inline
// join form. If the stored session turns out to be stale, it's cleared and
// the hook bails; the page will re-render into the join form.
export function useLiveRoom(roomCode: string) {
  const { setSession, setSnapshot, setConnected } = useRoomStore();
  const resumedRef = useRef(false);

  useEffect(() => {
    const code = roomCode.toUpperCase();
    const stored = loadSession(code);
    if (!stored) {
      // No session yet — let the page show the inline join UI.
      return;
    }
    setSession(stored);

    const socket = getSocket();

    const onConnect = () => {
      setConnected(true);
      socket.emit("auth:resume", { sessionToken: stored.sessionToken }, (res) => {
        if (!res.ok) {
          // Session is stale. Clear it and reload so the page shows the
          // inline join form instead of leaving the user stuck.
          clearSession(code);
          if (typeof window !== "undefined") window.location.reload();
          return;
        }
        resumedRef.current = true;
        setSession(res.session);
      });
    };
    const onDisconnect = () => setConnected(false);
    const onState = (snapshot: RoomSnapshot) => setSnapshot(snapshot);

    if (socket.connected) onConnect();
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("room:state", onState);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("room:state", onState);
    };
  }, [roomCode, setConnected, setSession, setSnapshot]);
}
