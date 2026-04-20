"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { clearSession, loadSession } from "@/lib/session";
import { getSocket } from "@/lib/socketClient";
import type { RoomSnapshot } from "@/lib/types";
import { useRoomStore } from "@/stores/useRoomStore";

// Hook that wires a page to a live room: resumes the session, listens for
// snapshots, and handles reconnect feedback. If the session isn't found it
// redirects back to the landing page.
export function useLiveRoom(roomCode: string) {
  const router = useRouter();
  const { setSession, setSnapshot, setConnected } = useRoomStore();
  const resumedRef = useRef(false);

  useEffect(() => {
    const code = roomCode.toUpperCase();
    const stored = loadSession(code);
    if (!stored) {
      router.replace("/");
      return;
    }
    setSession(stored);

    const socket = getSocket();

    const onConnect = () => {
      setConnected(true);
      socket.emit("auth:resume", { sessionToken: stored.sessionToken }, (res) => {
        if (!res.ok) {
          clearSession(code);
          router.replace("/");
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
  }, [roomCode, router, setConnected, setSession, setSnapshot]);
}
