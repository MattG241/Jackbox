"use client";

import { HostView } from "@/components/HostView";
import { useDisplayRoom } from "@/components/useDisplayRoom";

// /host/[code] is the TV display. It has no player session — it just
// subscribes to the room's broadcast channel via display:join and renders
// the current state. Host controls all live on phones (the first person
// to scan the play QR is host by default).
export default function HostPage({ params }: { params: { code: string } }) {
  useDisplayRoom(params.code);
  return <HostView />;
}
