"use client";

import { PlayerView } from "@/components/PlayerView";
import { useLiveRoom } from "@/components/useLiveRoom";

export default function PlayPage({ params }: { params: { code: string } }) {
  useLiveRoom(params.code);
  return <PlayerView />;
}
