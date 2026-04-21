import { NextRequest, NextResponse } from "next/server";
import { customAlphabet } from "nanoid";
import { prisma } from "@/lib/db";
import { remoteJoinSchema } from "@/lib/validation";
import { getRoomByCode } from "@/server/roomManager";

const tokenGen = customAlphabet(
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
  32
);

// POST /api/rooms/[code]/remote
// Body: { token }
//
// Presenting the room's remoteToken (encoded in the TV's "Host remote" QR)
// grants the caller a dedicated controller session. Remote players are
// non-playing but are authorized to issue host commands (start match,
// advance phase, pick game, end match) from their phone.
export async function POST(
  req: NextRequest,
  context: { params: { code: string } }
) {
  const code = context.params.code.toUpperCase();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = remoteJoinSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { token } = parsed.data;

  const room = await prisma.room.findUnique({ where: { code } });
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });
  if (room.status === "ENDED")
    return NextResponse.json({ error: "This room has ended." }, { status: 410 });
  if (room.remoteToken !== token)
    return NextResponse.json({ error: "Invalid remote token." }, { status: 403 });

  // Pick a non-colliding display name. Multiple phones can pair as remotes
  // for redundancy, so append a counter if needed.
  let displayName = "Remote";
  for (let i = 1; i <= 8; i++) {
    const taken = await prisma.player.findFirst({
      where: { roomId: room.id, displayName },
      select: { id: true },
    });
    if (!taken) break;
    displayName = `Remote ${i + 1}`;
  }

  const sessionToken = tokenGen();
  const player = await prisma.player.create({
    data: {
      roomId: room.id,
      displayName,
      sessionToken,
      isAudience: true,
      isRemote: true,
    },
  });

  // Register with the in-memory room so host-gating checks pass for this
  // player on the very first socket command, before the snapshot rebuilds.
  const live = getRoomByCode(code);
  live?.remotePlayerIds.add(player.id);

  return NextResponse.json({
    code,
    session: {
      sessionToken: player.sessionToken,
      playerId: player.id,
      displayName: player.displayName,
      isAudience: true,
      isHost: false,
      isRemote: true,
      roomCode: code,
    },
  });
}
