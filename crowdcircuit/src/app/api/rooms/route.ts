import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateRoomCode } from "@/lib/roomCode";
import { createRoomSchema } from "@/lib/validation";
import { firstLiveGameId } from "@/games/registry";

// POST /api/rooms — creates an empty room. The TV navigates to
// /host/[code] as a display-only client (no Player record, no session);
// the first person to scan the join QR is promoted to host by the /join
// endpoint.
export async function POST(req: NextRequest) {
  try {
    return await createRoom(req);
  } catch (err) {
    console.error("POST /api/rooms failed:", err);
    const message =
      err instanceof Error ? err.message : "Internal error creating room.";
    return NextResponse.json(
      { error: `Server error: ${message}` },
      { status: 500 }
    );
  }
}

async function createRoom(req: NextRequest) {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // Empty body is fine — every field below is optional.
  }
  const parsed = createRoomSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { familyMode, streamerMode } = parsed.data;

  // Retry a few times for rare code collisions.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode();
    const existing = await prisma.room.findUnique({ where: { code } });
    if (existing) continue;
    const room = await prisma.room.create({
      data: {
        code,
        familyMode: familyMode ?? false,
        streamerMode: streamerMode ?? false,
        // hostPlayerId stays null — the first non-audience scanner becomes
        // host. See /api/rooms/[code]/join.
        // Pre-select a live game so the lobby's "Next up" has a real
        // entry before anyone votes.
        selectedGameId: firstLiveGameId(),
      },
    });
    return NextResponse.json({
      code: room.code,
      // The TV saves this to localStorage so it can render the optional
      // "Host remote" QR on reload. Now that the first scanner is host by
      // default this QR is redundant for most sessions, but it still lets
      // a non-playing phone drive the room if anyone wants that.
      remoteToken: room.remoteToken,
    });
  }
  return NextResponse.json(
    { error: "Could not allocate a room code." },
    { status: 500 }
  );
}
