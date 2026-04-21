import { NextRequest, NextResponse } from "next/server";
import { customAlphabet } from "nanoid";
import { prisma } from "@/lib/db";
import { generateRoomCode } from "@/lib/roomCode";
import { isDisplayNameOk } from "@/lib/moderation";
import { createRoomSchema } from "@/lib/validation";

const tokenGen = customAlphabet(
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
  32
);

// POST /api/rooms — creates a room and returns the host session.
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createRoomSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { hostName, familyMode, streamerMode, avatarColor, avatarEmoji } = parsed.data;
  const nameCheck = isDisplayNameOk(hostName, familyMode);
  if (!nameCheck.ok) {
    return NextResponse.json({ error: nameCheck.reason }, { status: 400 });
  }

  // Retry a few times for rare code collisions.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode();
    const existing = await prisma.room.findUnique({ where: { code } });
    if (existing) continue;
    const sessionToken = tokenGen();
    const room = await prisma.room.create({
      data: {
        code,
        familyMode: familyMode ?? false,
        streamerMode: streamerMode ?? false,
        players: {
          create: {
            displayName: nameCheck.cleaned,
            sessionToken,
            isAudience: false,
            ...(avatarColor ? { avatarColor } : {}),
            ...(avatarEmoji ? { avatarEmoji } : {}),
          },
        },
      },
      include: { players: true },
    });
    const host = room.players[0];
    const updated = await prisma.room.update({
      where: { id: room.id },
      data: { hostPlayerId: host.id },
    });
    return NextResponse.json({
      code: updated.code,
      session: {
        sessionToken: host.sessionToken,
        playerId: host.id,
        displayName: host.displayName,
        isAudience: false,
        isHost: true,
        roomCode: updated.code,
      },
    });
  }
  return NextResponse.json({ error: "Could not allocate a room code." }, { status: 500 });
}
