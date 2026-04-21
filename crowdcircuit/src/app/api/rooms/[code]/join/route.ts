import { NextRequest, NextResponse } from "next/server";
import { customAlphabet } from "nanoid";
import { prisma } from "@/lib/db";
import { isDisplayNameOk } from "@/lib/moderation";
import { joinRoomSchema } from "@/lib/validation";
import { DEFAULTS } from "@/server/roomManager";

const tokenGen = customAlphabet(
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
  32
);

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
  const parsed = joinRoomSchema.safeParse({ ...(body as object), code });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { displayName, asAudience, avatarColor, avatarEmoji } = parsed.data;

  const room = await prisma.room.findUnique({
    where: { code },
    include: { players: { where: { isAudience: false } } },
  });
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });
  if (room.status === "ENDED")
    return NextResponse.json({ error: "This room has ended." }, { status: 410 });

  const nameCheck = isDisplayNameOk(displayName, room.familyMode);
  if (!nameCheck.ok)
    return NextResponse.json({ error: nameCheck.reason }, { status: 400 });

  // Prevent display-name collision within the same room.
  const collision = await prisma.player.findFirst({
    where: { roomId: room.id, displayName: nameCheck.cleaned },
  });
  if (collision) {
    return NextResponse.json(
      { error: "That name is already taken in this room." },
      { status: 409 }
    );
  }

  if (!asAudience && room.players.length >= DEFAULTS.MAX_PLAYERS) {
    return NextResponse.json(
      {
        error: `This room already has ${DEFAULTS.MAX_PLAYERS} players. Join as audience instead.`,
        audienceAvailable: true,
      },
      { status: 409 }
    );
  }

  if (!asAudience && room.status === "IN_MATCH") {
    return NextResponse.json(
      {
        error: "Match in progress — join as audience until the next match.",
        audienceAvailable: true,
      },
      { status: 409 }
    );
  }

  const sessionToken = tokenGen();
  const player = await prisma.player.create({
    data: {
      roomId: room.id,
      displayName: nameCheck.cleaned,
      sessionToken,
      isAudience: asAudience,
      ...(avatarColor ? { avatarColor } : {}),
      ...(avatarEmoji ? { avatarEmoji } : {}),
    },
  });

  return NextResponse.json({
    code,
    session: {
      sessionToken: player.sessionToken,
      playerId: player.id,
      displayName: player.displayName,
      isAudience: player.isAudience,
      isHost: false,
      roomCode: code,
    },
  });
}
