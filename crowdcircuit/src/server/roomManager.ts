import type { Server } from "socket.io";
import { prisma } from "@/lib/db";
import type {
  Phase,
  PublicPlayer,
  RevealItem,
  RoomSnapshot,
  ServerToClientEvents,
  ClientToServerEvents,
} from "@/lib/types";
import { shuffle } from "@/lib/utils";

// Constants — mirror the MVP defaults spelled out in the spec.
export const DEFAULTS = {
  MAX_PLAYERS: 10,
  MIN_PLAYERS: 3,
  TOTAL_ROUNDS: 5,
  SUBMIT_SECONDS: 45,
  REVEAL_SECONDS: 8,
  VOTE_SECONDS: 20,
  SCORE_SECONDS: 8,
  AUDIENCE_VOTE_WEIGHT: 0.35,
};

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

// In-memory room state. The database is the authoritative persistence layer,
// but we keep derived state + timers here for responsiveness. On server boot
// nothing is eagerly hydrated: rooms load lazily when a socket resumes a session
// or a host reconnects.
interface LiveRoom {
  id: string;
  code: string;
  hostPlayerId: string | null;
  familyMode: boolean;
  streamerMode: boolean;
  phase: Phase;
  matchId: string | null;
  round: {
    id: string;
    number: number;
    total: number;
    promptText: string;
    criterionLabel: string;
    criterionHidden: boolean;
    phaseEndsAt: number | null;
    reveal: RevealItem[];
    roundSummary: { playerId: string; name: string; delta: number }[] | null;
  } | null;
  phaseTimer: NodeJS.Timeout | null;
  sockets: Set<string>;
}

const rooms = new Map<string, LiveRoom>(); // keyed by room code
const socketToContext = new Map<
  string,
  { roomCode: string; playerId: string; sessionToken: string }
>();

export function getRoomByCode(code: string): LiveRoom | undefined {
  return rooms.get(code);
}

function clearPhaseTimer(room: LiveRoom) {
  if (room.phaseTimer) {
    clearTimeout(room.phaseTimer);
    room.phaseTimer = null;
  }
}

export async function ensureRoomLoaded(code: string): Promise<LiveRoom | null> {
  const existing = rooms.get(code);
  if (existing) return existing;
  const row = await prisma.room.findUnique({ where: { code } });
  if (!row) return null;
  const live: LiveRoom = {
    id: row.id,
    code: row.code,
    hostPlayerId: row.hostPlayerId,
    familyMode: row.familyMode,
    streamerMode: row.streamerMode,
    phase: "LOBBY",
    matchId: null,
    round: null,
    phaseTimer: null,
    sockets: new Set(),
  };
  rooms.set(code, live);
  return live;
}

export async function buildSnapshot(room: LiveRoom): Promise<RoomSnapshot> {
  const players = await prisma.player.findMany({
    where: { roomId: room.id },
    orderBy: { joinedAt: "asc" },
  });

  // Total scores per player from the current match if any.
  const scoreByPlayer = new Map<string, number>();
  if (room.matchId) {
    const totals = await prisma.scoreEvent.groupBy({
      by: ["playerId"],
      where: { round: { matchId: room.matchId } },
      _sum: { points: true },
    });
    for (const t of totals) scoreByPlayer.set(t.playerId, t._sum.points ?? 0);
  }

  const corePlayers: PublicPlayer[] = players
    .filter((p) => !p.isAudience)
    .map((p) => ({
      id: p.id,
      displayName: p.displayName,
      isAudience: false,
      connected: p.connected,
      isHost: p.id === room.hostPlayerId,
      score: scoreByPlayer.get(p.id) ?? 0,
    }));

  const audienceCount = players.filter((p) => p.isAudience).length;

  let submittedIds: string[] = [];
  let votedIds: string[] = [];
  if (room.round) {
    const [subs, votes] = await Promise.all([
      prisma.submission.findMany({
        where: { roundId: room.round.id },
        select: { playerId: true },
      }),
      prisma.vote.findMany({ where: { roundId: room.round.id }, select: { voterId: true } }),
    ]);
    submittedIds = subs.map((s) => s.playerId);
    votedIds = votes.map((v) => v.voterId);
  }

  return {
    code: room.code,
    status: room.matchId ? "IN_MATCH" : "LOBBY",
    phase: room.phase,
    hostPlayerId: room.hostPlayerId,
    familyMode: room.familyMode,
    streamerMode: room.streamerMode,
    players: corePlayers,
    audienceCount,
    round: room.round
      ? {
          number: room.round.number,
          total: room.round.total,
          prompt: room.round.promptText,
          criterionLabel: room.round.criterionHidden ? null : room.round.criterionLabel,
          criterionHidden: room.round.criterionHidden,
          phaseEndsAt: room.round.phaseEndsAt,
          submittedPlayerIds: submittedIds,
          reveal: room.round.reveal,
          votedVoterIds: votedIds,
          roundSummary: room.round.roundSummary,
        }
      : null,
  };
}

export async function broadcast(io: IO, room: LiveRoom) {
  const snapshot = await buildSnapshot(room);
  io.to(`room:${room.code}`).emit("room:state", snapshot);
}

export function bindSocketContext(
  socketId: string,
  ctx: { roomCode: string; playerId: string; sessionToken: string }
) {
  socketToContext.set(socketId, ctx);
}

export function getSocketContext(socketId: string) {
  return socketToContext.get(socketId);
}

export function unbindSocketContext(socketId: string) {
  return socketToContext.delete(socketId);
}

export async function markDisconnected(io: IO, socketId: string) {
  const ctx = socketToContext.get(socketId);
  if (!ctx) return;
  socketToContext.delete(socketId);
  const room = rooms.get(ctx.roomCode);
  if (!room) return;
  room.sockets.delete(socketId);

  // Grace period: if the player doesn't reconnect in 10 seconds, mark offline.
  setTimeout(async () => {
    // Is there still an active socket for this player? Use a scan over the context map.
    let stillConnected = false;
    for (const v of socketToContext.values()) {
      if (v.playerId === ctx.playerId) {
        stillConnected = true;
        break;
      }
    }
    if (!stillConnected) {
      await prisma.player.update({
        where: { id: ctx.playerId },
        data: { connected: false, lastSeenAt: new Date() },
      });
      const r = rooms.get(ctx.roomCode);
      if (r) await broadcast(io, r);
    }
  }, 10_000);
}

// ---- Game Engine (Hot Take Hustle) ----

async function pickPromptAndCriterion(room: LiveRoom, usedPromptIds: Set<string>) {
  const rating = room.familyMode ? "FAMILY" : undefined;
  const prompts = await prisma.prompt.findMany({
    where: rating ? { rating: "FAMILY" } : {},
  });
  const criteria = await prisma.criterion.findMany({
    where: rating ? { rating: "FAMILY" } : {},
  });
  if (!prompts.length || !criteria.length) {
    throw new Error("No prompts/criteria seeded. Run `npm run db:seed`.");
  }
  const available = prompts.filter((p) => !usedPromptIds.has(p.id));
  const pool = available.length ? available : prompts;
  const prompt = pool[Math.floor(Math.random() * pool.length)];
  const criterion = criteria[Math.floor(Math.random() * criteria.length)];
  return { prompt, criterion };
}

export async function startMatch(io: IO, room: LiveRoom, requesterPlayerId: string) {
  if (requesterPlayerId !== room.hostPlayerId) throw new Error("Only the host can start.");
  const corePlayers = await prisma.player.count({
    where: { roomId: room.id, isAudience: false, connected: true },
  });
  if (corePlayers < DEFAULTS.MIN_PLAYERS)
    throw new Error(`Need at least ${DEFAULTS.MIN_PLAYERS} players.`);

  const match = await prisma.match.create({
    data: {
      roomId: room.id,
      status: "RUNNING",
      totalRounds: DEFAULTS.TOTAL_ROUNDS,
      currentRound: 0,
      startedAt: new Date(),
    },
  });
  await prisma.room.update({ where: { id: room.id }, data: { status: "IN_MATCH" } });
  room.matchId = match.id;
  await advanceToNextRound(io, room);
}

async function advanceToNextRound(io: IO, room: LiveRoom) {
  if (!room.matchId) return;
  const match = await prisma.match.findUnique({ where: { id: room.matchId } });
  if (!match) return;

  const nextRoundNumber = match.currentRound + 1;
  if (nextRoundNumber > match.totalRounds) {
    await endMatch(io, room);
    return;
  }

  const usedPromptIds = new Set(
    (await prisma.round.findMany({ where: { matchId: match.id }, select: { promptId: true } }))
      .map((r) => r.promptId)
  );

  const { prompt, criterion } = await pickPromptAndCriterion(room, usedPromptIds);
  const round = await prisma.round.create({
    data: {
      matchId: match.id,
      roundNumber: nextRoundNumber,
      promptId: prompt.id,
      criterionId: criterion.id,
      phase: "SUBMIT",
      phaseEndsAt: new Date(Date.now() + DEFAULTS.SUBMIT_SECONDS * 1000),
    },
  });
  await prisma.match.update({
    where: { id: match.id },
    data: { currentRound: nextRoundNumber },
  });

  room.phase = "SUBMIT";
  room.round = {
    id: round.id,
    number: nextRoundNumber,
    total: match.totalRounds,
    promptText: prompt.text,
    criterionLabel: criterion.label,
    criterionHidden: true, // secret criterion!
    phaseEndsAt: round.phaseEndsAt!.getTime(),
    reveal: [],
    roundSummary: null,
  };
  schedulePhaseEnd(io, room, DEFAULTS.SUBMIT_SECONDS, () => enterRevealPhase(io, room));
  await broadcast(io, room);
}

function schedulePhaseEnd(io: IO, room: LiveRoom, seconds: number, next: () => void) {
  clearPhaseTimer(room);
  room.phaseTimer = setTimeout(next, seconds * 1000);
}

async function enterRevealPhase(io: IO, room: LiveRoom) {
  if (!room.round) return;
  const submissions = await prisma.submission.findMany({
    where: { roundId: room.round.id },
    include: { player: { select: { id: true, displayName: true } } },
  });
  const reveal: RevealItem[] = shuffle(
    submissions.map((s) => ({
      submissionId: s.id,
      authorId: s.playerId,
      authorName: s.player.displayName,
      text: s.text,
    }))
  );
  room.phase = "REVEAL";
  room.round.phaseEndsAt = Date.now() + DEFAULTS.REVEAL_SECONDS * 1000;
  room.round.reveal = reveal;
  await prisma.round.update({
    where: { id: room.round.id },
    data: { phase: "REVEAL", phaseEndsAt: new Date(room.round.phaseEndsAt) },
  });
  schedulePhaseEnd(io, room, DEFAULTS.REVEAL_SECONDS, () => enterVotePhase(io, room));
  await broadcast(io, room);
}

async function enterVotePhase(io: IO, room: LiveRoom) {
  if (!room.round) return;
  room.phase = "VOTE";
  room.round.criterionHidden = false; // secret criterion revealed here.
  room.round.phaseEndsAt = Date.now() + DEFAULTS.VOTE_SECONDS * 1000;
  await prisma.round.update({
    where: { id: room.round.id },
    data: { phase: "VOTE", phaseEndsAt: new Date(room.round.phaseEndsAt) },
  });
  schedulePhaseEnd(io, room, DEFAULTS.VOTE_SECONDS, () => enterScorePhase(io, room));
  await broadcast(io, room);
}

async function enterScorePhase(io: IO, room: LiveRoom) {
  if (!room.round) return;
  const [submissions, votes, players] = await Promise.all([
    prisma.submission.findMany({ where: { roundId: room.round.id } }),
    prisma.vote.findMany({ where: { roundId: room.round.id } }),
    prisma.player.findMany({ where: { roomId: room.id } }),
  ]);
  const audienceSet = new Set(players.filter((p) => p.isAudience).map((p) => p.id));
  // Each submission's weighted score.
  const tally = new Map<string, number>(); // submissionId -> weighted votes
  const voterCountBySubmission = new Map<string, number>();
  for (const s of submissions) tally.set(s.id, 0);
  for (const v of votes) {
    const w = audienceSet.has(v.voterId) ? DEFAULTS.AUDIENCE_VOTE_WEIGHT : 1;
    tally.set(v.submissionId, (tally.get(v.submissionId) ?? 0) + w);
    voterCountBySubmission.set(
      v.submissionId,
      (voterCountBySubmission.get(v.submissionId) ?? 0) + 1
    );
  }

  // Scoring rules:
  //  - Top submission gets +1000 points.
  //  - Each vote received grants +100 to the author (capped at 500).
  //  - Voters who voted for the top submission get a +200 bonus (sharp voting).
  //  - Writers who submitted receive +50 participation points.
  const submissionAuthor = new Map(submissions.map((s) => [s.id, s.playerId]));
  let topSubmissionId: string | null = null;
  let topScore = -1;
  for (const [sid, score] of tally.entries()) {
    if (score > topScore) {
      topSubmissionId = sid;
      topScore = score;
    }
  }

  const scoreDelta = new Map<string, number>();
  function add(playerId: string, pts: number, reason: string) {
    scoreDelta.set(playerId, (scoreDelta.get(playerId) ?? 0) + pts);
    scoreEvents.push({ roundId: room.round!.id, playerId, points: pts, reason });
  }
  const scoreEvents: { roundId: string; playerId: string; points: number; reason: string }[] = [];

  for (const s of submissions) add(s.playerId, 50, "participation");
  for (const [sid, count] of voterCountBySubmission.entries()) {
    const authorId = submissionAuthor.get(sid);
    if (!authorId) continue;
    add(authorId, Math.min(500, count * 100), "votes_received");
  }
  if (topSubmissionId && topScore > 0) {
    const topAuthor = submissionAuthor.get(topSubmissionId);
    if (topAuthor) add(topAuthor, 1000, "top_take");
    for (const v of votes) {
      if (v.submissionId === topSubmissionId && !audienceSet.has(v.voterId)) {
        add(v.voterId, 200, "sharp_voting");
      }
    }
  }

  if (scoreEvents.length)
    await prisma.scoreEvent.createMany({ data: scoreEvents });

  const nameById = new Map(players.map((p) => [p.id, p.displayName]));
  const summary = Array.from(scoreDelta.entries())
    .map(([playerId, delta]) => ({ playerId, name: nameById.get(playerId) ?? "?", delta }))
    .sort((a, b) => b.delta - a.delta);

  room.phase = "SCORE";
  room.round.roundSummary = summary;
  room.round.phaseEndsAt = Date.now() + DEFAULTS.SCORE_SECONDS * 1000;
  await prisma.round.update({
    where: { id: room.round.id },
    data: { phase: "SCORE", phaseEndsAt: new Date(room.round.phaseEndsAt) },
  });
  schedulePhaseEnd(io, room, DEFAULTS.SCORE_SECONDS, () => advanceToNextRound(io, room));
  await broadcast(io, room);
}

export async function endMatch(io: IO, room: LiveRoom) {
  clearPhaseTimer(room);
  if (room.matchId) {
    await prisma.match.update({
      where: { id: room.matchId },
      data: { status: "FINISHED", endedAt: new Date() },
    });
  }
  await prisma.room.update({ where: { id: room.id }, data: { status: "LOBBY" } });
  room.phase = "MATCH_END";
  await broadcast(io, room);
  // After a short delay, return to LOBBY so players can start another match.
  setTimeout(async () => {
    room.phase = "LOBBY";
    room.matchId = null;
    room.round = null;
    await broadcast(io, room);
  }, 12_000);
}

export async function hostNextPhase(io: IO, room: LiveRoom, requesterPlayerId: string) {
  if (requesterPlayerId !== room.hostPlayerId) throw new Error("Only the host can advance.");
  // Host can cut short the current timer (useful for SCORE/REVEAL screens);
  // core gameplay phases are still server-authoritative.
  if (room.phase === "SUBMIT") return enterRevealPhase(io, room);
  if (room.phase === "REVEAL") return enterVotePhase(io, room);
  if (room.phase === "VOTE") return enterScorePhase(io, room);
  if (room.phase === "SCORE") return advanceToNextRound(io, room);
  if (room.phase === "MATCH_END") {
    room.phase = "LOBBY";
    room.matchId = null;
    room.round = null;
    await broadcast(io, room);
  }
}

export async function playerSubmit(
  io: IO,
  room: LiveRoom,
  playerId: string,
  text: string
) {
  if (!room.round || room.phase !== "SUBMIT")
    throw new Error("Not accepting submissions right now.");
  const player = await prisma.player.findUnique({ where: { id: playerId } });
  if (!player) throw new Error("Player not found.");
  if (player.isAudience) throw new Error("Audience members can't submit takes.");
  await prisma.submission.upsert({
    where: { roundId_playerId: { roundId: room.round.id, playerId } },
    update: { text },
    create: { roundId: room.round.id, playerId, text },
  });
  // If all core players have submitted, short-circuit into reveal.
  const [corePlayers, subs] = await Promise.all([
    prisma.player.count({
      where: { roomId: room.id, isAudience: false, connected: true },
    }),
    prisma.submission.count({ where: { roundId: room.round.id } }),
  ]);
  if (subs >= corePlayers) {
    await enterRevealPhase(io, room);
  } else {
    await broadcast(io, room);
  }
}

export async function playerVote(
  io: IO,
  room: LiveRoom,
  voterId: string,
  submissionId: string
) {
  if (!room.round || room.phase !== "VOTE")
    throw new Error("Voting isn't open right now.");
  const [voter, sub] = await Promise.all([
    prisma.player.findUnique({ where: { id: voterId } }),
    prisma.submission.findUnique({ where: { id: submissionId } }),
  ]);
  if (!voter) throw new Error("Voter not found.");
  if (!sub || sub.roundId !== room.round.id) throw new Error("Invalid submission.");
  if (sub.playerId === voterId) throw new Error("You can't vote for yourself.");

  const weight = voter.isAudience ? DEFAULTS.AUDIENCE_VOTE_WEIGHT : 1;
  await prisma.vote.upsert({
    where: { roundId_voterId: { roundId: room.round.id, voterId } },
    update: { submissionId, weight },
    create: { roundId: room.round.id, voterId, submissionId, weight },
  });

  const [eligible, cast] = await Promise.all([
    prisma.player.count({
      where: { roomId: room.id, connected: true },
    }),
    prisma.vote.count({ where: { roundId: room.round.id } }),
  ]);
  if (cast >= eligible) {
    await enterScorePhase(io, room);
  } else {
    await broadcast(io, room);
  }
}

export async function updateSettings(
  room: LiveRoom,
  requesterPlayerId: string,
  patch: { familyMode?: boolean; streamerMode?: boolean }
) {
  if (requesterPlayerId !== room.hostPlayerId) throw new Error("Only the host can change settings.");
  const data: { familyMode?: boolean; streamerMode?: boolean } = {};
  if (typeof patch.familyMode === "boolean") {
    data.familyMode = patch.familyMode;
    room.familyMode = patch.familyMode;
  }
  if (typeof patch.streamerMode === "boolean") {
    data.streamerMode = patch.streamerMode;
    room.streamerMode = patch.streamerMode;
  }
  if (Object.keys(data).length)
    await prisma.room.update({ where: { id: room.id }, data });
}

export async function reportContent(
  room: LiveRoom,
  content: string,
  reason?: string
) {
  await prisma.moderationFlag.create({
    data: {
      roomId: room.id,
      content: content.slice(0, 500),
      notes: reason?.slice(0, 200),
      reason: "OTHER",
    },
  });
}
