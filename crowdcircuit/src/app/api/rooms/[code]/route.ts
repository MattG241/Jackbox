import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/rooms/[code] — minimal existence probe used by the TV landing
// page to decide whether to resume a cached room code or spin up a fresh
// one. Returns 200 with a small summary when present, 404 otherwise.
export async function GET(
  _req: Request,
  context: { params: { code: string } }
) {
  const code = context.params.code.toUpperCase();
  const room = await prisma.room.findUnique({
    where: { code },
    select: { code: true, status: true },
  });
  if (!room) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }
  return NextResponse.json({ code: room.code, status: room.status });
}
