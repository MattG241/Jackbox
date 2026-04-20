import type { Server as HttpServer } from "http";
import { Server as IOServer } from "socket.io";
import { prisma } from "@/lib/db";
import type {
  ActionResult,
  ClientToServerEvents,
  ServerToClientEvents,
} from "@/lib/types";
import {
  bindSocketContext,
  broadcast,
  ensureRoomLoaded,
  getSocketContext,
  hostNextPhase,
  markDisconnected,
  playerSubmit,
  playerVote,
  reportContent,
  startMatch,
  updateSettings,
  endMatch,
} from "./roomManager";
import { moderateText } from "@/lib/moderation";

type IO = IOServer<ClientToServerEvents, ServerToClientEvents>;

function wrap(fn: () => Promise<void>, cb: (res: ActionResult) => void) {
  fn()
    .then(() => cb({ ok: true }))
    .catch((err: unknown) => {
      const reason = err instanceof Error ? err.message : "Unknown error";
      cb({ ok: false, reason });
    });
}

export function attachSocketServer(httpServer: HttpServer): IO {
  const io: IO = new IOServer(httpServer, {
    cors: { origin: "*" },
    // Trust the first proxy hop so reconnects work behind load balancers.
    transports: ["websocket", "polling"],
  });

  io.on("connection", (socket) => {
    socket.on("auth:resume", async ({ sessionToken }, cb) => {
      try {
        const player = await prisma.player.findUnique({
          where: { sessionToken },
          include: { room: true },
        });
        if (!player) return cb({ ok: false, reason: "Session not found. Rejoin the room." });
        const room = await ensureRoomLoaded(player.room.code);
        if (!room) return cb({ ok: false, reason: "Room no longer exists." });
        socket.join(`room:${room.code}`);
        room.sockets.add(socket.id);
        bindSocketContext(socket.id, {
          roomCode: room.code,
          playerId: player.id,
          sessionToken: player.sessionToken,
        });
        await prisma.player.update({
          where: { id: player.id },
          data: { connected: true, lastSeenAt: new Date() },
        });
        cb({
          ok: true,
          session: {
            sessionToken: player.sessionToken,
            playerId: player.id,
            displayName: player.displayName,
            isAudience: player.isAudience,
            isHost: player.id === room.hostPlayerId,
            roomCode: room.code,
          },
        });
        await broadcast(io, room);
      } catch (err) {
        const reason = err instanceof Error ? err.message : "Failed to resume session.";
        cb({ ok: false, reason });
      }
    });

    socket.on("host:startMatch", (cb) => {
      const ctx = getSocketContext(socket.id);
      if (!ctx) return cb({ ok: false, reason: "Not in a room." });
      wrap(async () => {
        const room = await ensureRoomLoaded(ctx.roomCode);
        if (!room) throw new Error("Room not found.");
        await startMatch(io, room, ctx.playerId);
      }, cb);
    });

    socket.on("host:nextPhase", (cb) => {
      const ctx = getSocketContext(socket.id);
      if (!ctx) return cb({ ok: false, reason: "Not in a room." });
      wrap(async () => {
        const room = await ensureRoomLoaded(ctx.roomCode);
        if (!room) throw new Error("Room not found.");
        await hostNextPhase(io, room, ctx.playerId);
      }, cb);
    });

    socket.on("host:updateSettings", (patch, cb) => {
      const ctx = getSocketContext(socket.id);
      if (!ctx) return cb({ ok: false, reason: "Not in a room." });
      wrap(async () => {
        const room = await ensureRoomLoaded(ctx.roomCode);
        if (!room) throw new Error("Room not found.");
        await updateSettings(room, ctx.playerId, patch);
        await broadcast(io, room);
      }, cb);
    });

    socket.on("host:endMatch", (cb) => {
      const ctx = getSocketContext(socket.id);
      if (!ctx) return cb({ ok: false, reason: "Not in a room." });
      wrap(async () => {
        const room = await ensureRoomLoaded(ctx.roomCode);
        if (!room) throw new Error("Room not found.");
        if (room.hostPlayerId !== ctx.playerId) throw new Error("Only the host can end the match.");
        await endMatch(io, room);
      }, cb);
    });

    socket.on("player:submit", ({ text }, cb) => {
      const ctx = getSocketContext(socket.id);
      if (!ctx) return cb({ ok: false, reason: "Not in a room." });
      wrap(async () => {
        const room = await ensureRoomLoaded(ctx.roomCode);
        if (!room) throw new Error("Room not found.");
        const moderation = moderateText(text, { familyMode: room.familyMode, maxLen: 140 });
        if (!moderation.ok) throw new Error(moderation.reason);
        await playerSubmit(io, room, ctx.playerId, moderation.cleaned);
      }, cb);
    });

    socket.on("player:vote", ({ submissionId }, cb) => {
      const ctx = getSocketContext(socket.id);
      if (!ctx) return cb({ ok: false, reason: "Not in a room." });
      wrap(async () => {
        const room = await ensureRoomLoaded(ctx.roomCode);
        if (!room) throw new Error("Room not found.");
        await playerVote(io, room, ctx.playerId, submissionId);
      }, cb);
    });

    socket.on("player:report", ({ content, reason }, cb) => {
      const ctx = getSocketContext(socket.id);
      if (!ctx) return cb({ ok: false, reason: "Not in a room." });
      wrap(async () => {
        const room = await ensureRoomLoaded(ctx.roomCode);
        if (!room) throw new Error("Room not found.");
        await reportContent(room, content, reason);
      }, cb);
    });

    socket.on("disconnect", () => {
      markDisconnected(io, socket.id);
    });
  });

  return io;
}
