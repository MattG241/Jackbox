"use client";

import { HostView } from "@/components/HostView";
import { useLiveRoom } from "@/components/useLiveRoom";

export default function HostPage({ params }: { params: { code: string } }) {
  useLiveRoom(params.code);
  return <HostView />;
}
