"use client";

import { useEffect } from "react";
import { getSocket } from "@/lib/socketClient";
import type { RoomSnapshot } from "@/lib/types";
import { useRoomStore } from "@/stores/useRoomStore";

// Display-only subscription used by the TV host view. No session, no
// Player — just join the room's broadcast channel and render whatever
// state the server sends. The TV never issues host commands; those are
// authored from the phone that's currently designated host (the first
// scanner, by default).
export function useDisplayRoom(roomCode: string) {
  const { setSnapshot, setConnected } = useRoomStore();

  useEffect(() => {
    const code = roomCode.toUpperCase();
    const socket = getSocket();

    const onConnect = () => {
      setConnected(true);
      socket.emit("display:join", { code }, () => {
        // Errors are displayed via the toast channel; if the room isn't
        // found the TV just shows the loader — the operator can go back
        // and create a new one.
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
  }, [roomCode, setConnected, setSnapshot]);
}
