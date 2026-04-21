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
  const { hostName, familyMode, streamerMode, avatarColor, avatarEmoji, hostIsAudience } =
    parsed.data;
  const effectiveName = hostName && hostName.trim().length > 0 ? hostName : "TV";
  const nameCheck = isDisplayNameOk(effectiveName, familyMode);
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
            isAudience: hostIsAudience ?? false,
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
        isAudience: hostIsAudience ?? false,
        isHost: true,
        roomCode: updated.code,
      },
    });
  }
  return NextResponse.json({ error: "Could not allocate a room code." }, { status: 500 });
}
