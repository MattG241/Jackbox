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
  canControl,
  ensureRoomLoaded,
  getSocketContext,
  hostNextPhase,
  markDisconnected,
  playerSubmit,
  playerVote,
  playerVoteGame,
  reportContent,
  startMatch,
  updateSettings,
  endMatch,
} from "./roomManager";
import { moderateText } from "@/lib/moderation";
import { getGame } from "@/games/registry";

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
    // The TV (and any other read-only display) joins with just the room
    // code — no session, no Player. This is the hostless TV entry point.
    // The socket gets added to the room channel so broadcasts hit it, and
    // a fresh snapshot is pushed back immediately.
    socket.on("display:join", async ({ code }, cb) => {
      try {
        const normalized = (code ?? "").toUpperCase();
        if (!normalized || normalized.length < 3) {
          return cb({ ok: false, reason: "Invalid room code." });
        }
        const room = await ensureRoomLoaded(normalized);
        if (!room) {
          return cb({ ok: false, reason: "Room not found." });
        }
        socket.join(`room:${room.code}`);
        room.sockets.add(socket.id);
        cb({ ok: true });
        // Send a snapshot straight to this socket so the TV renders
        // immediately without waiting for the next broadcast.
        const { buildSnapshot } = await import("./roomManager");
        const snap = await buildSnapshot(room);
        socket.emit("room:state", snap);
      } catch (err) {
        const reason =
          err instanceof Error ? err.message : "Failed to join display.";
        cb({ ok: false, reason });
      }
    });

    socket.on("auth:resume", async ({ sessionToken }, cb) => {
      try {
        const player = await prisma.player.findUnique({
          where: { sessionToken },
          include: { room: true },
        });
        if (!player) return cb({ ok: false, reason: "Session not found. Rejoin the room." });
        const room = await ensureRoomLoaded(player.room.code);
        if (!room) return cb({ ok: false, reason: "Room no longer exists." });
        // Ensure the in-memory remote set is current. ensureRoomLoaded
        // populates it from DB on first load, but a remote paired via
        // the HTTP endpoint after that needs its id re-seeded here.
        if (player.isRemote) room.remotePlayerIds.add(player.id);
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
            isRemote: player.isRemote,
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
        if (!canControl(ctx.playerId, room)) throw new Error("Only the host can end the match.");
        await endMatch(io, room);
      }, cb);
    });

    socket.on("player:submit", ({ text }, cb) => {
      const ctx = getSocketContext(socket.id);
      if (!ctx) return cb({ ok: false, reason: "Not in a room." });
      wrap(async () => {
        const room = await ensureRoomLoaded(ctx.roomCode);
        if (!room) throw new Error("Room not found.");
        // Moderation only applies to TEXT submissions. DRAWING/QUIZ/TAP are
        // structured payloads the server validates inside playerSubmit.
        const gameId = room.round?.gameId ?? room.currentGameId;
        const kind = getGame(gameId).submissionKind;
        let payload = text;
        if (kind === "TEXT") {
          const moderation = moderateText(text, { familyMode: room.familyMode, maxLen: 140 });
          if (!moderation.ok) throw new Error(moderation.reason);
          payload = moderation.cleaned;
        }
        await playerSubmit(io, room, ctx.playerId, payload);
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

    socket.on("player:voteGame", ({ gameId }, cb) => {
      const ctx = getSocketContext(socket.id);
      if (!ctx) return cb({ ok: false, reason: "Not in a room." });
      wrap(async () => {
        const room = await ensureRoomLoaded(ctx.roomCode);
        if (!room) throw new Error("Room not found.");
        await playerVoteGame(io, room, ctx.playerId, gameId);
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
