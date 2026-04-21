import type { Server } from "socket.io";
import { prisma } from "@/lib/db";
import type {
  ChainReveal,
  GameCard,
  MashupReveal,
  MatchHighlight,
  Phase,
  PlayerStageTarget,
  PublicPlayer,
  RevealItem,
  RoomSnapshot,
  ServerToClientEvents,
  ClientToServerEvents,
} from "@/lib/types";
import { shuffle } from "@/lib/utils";
import { GAMES, GAME_LIST, getGame } from "@/games/registry";
import { clampDrawing } from "@/lib/drawing";

// Constants — mirror the MVP defaults spelled out in the spec.
export const DEFAULTS = {
  MAX_PLAYERS: 10,
  // Normally 3+, but allow solo so you can demo/playtest every game alone.
  MIN_PLAYERS: 1,
  TOTAL_ROUNDS: 5,
  SUBMIT_SECONDS: 45,
  REVEAL_SECONDS: 8,
  VOTE_SECONDS: 20,
  SCORE_SECONDS: 8,
  AUDIENCE_VOTE_WEIGHT: 0.35,
  // Jackbox-style final-round drama: every point scored in the last round
  // counts double, so a late comeback is always possible.
  FINAL_ROUND_MULTIPLIER: 2,
  // Speed bonus — first three submitters in take/fib rounds grab a kicker.
  SPEED_BONUSES: [120, 80, 40],
};

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

// In-memory room state. DB is authoritative for persistence; we keep derived
// state + phase timers here for responsiveness.
interface LiveRoom {
  id: string;
  code: string;
  hostPlayerId: string | null;
  familyMode: boolean;
  streamerMode: boolean;
  selectedGameId: string;
  currentGameId: string;
  phase: Phase;
  matchId: string | null;
  round: {
    id: string;
    number: number;
    total: number;
    gameId: string;
    promptText: string;
    promptTruth: string | null;
    promptDetail: string | null;
    choices: string[] | null;
    criterionLabel: string | null;
    criterionHidden: boolean;
    phaseEndsAt: number | null;
    reveal: RevealItem[];
    // For QUIZ phase reveal: whether the truth has been unveiled yet.
    truthRevealed: boolean;
    roundSummary: { playerId: string; name: string; delta: number }[] | null;
    // Multi-stage games: which stage we're on, and how many total.
    stage: number;
    totalStages: number;
    // Per-player target for the current SUBMIT stage (chain/combo games).
    playerTargets: Record<string, PlayerStageTarget> | null;
    // Chain/combo reveal data, populated at REVEAL phase.
    chains: ChainReveal[] | null;
    mashups: MashupReveal[] | null;
  } | null;
  phaseTimer: NodeJS.Timeout | null;
  sockets: Set<string>;
  // Computed on MATCH_END, then broadcast in the snapshot so the host TV can
  // render MVP awards. Cleared when the room returns to LOBBY.
  highlights: MatchHighlight[];
  // Player ids authorized as phone-as-remote controllers — they can issue
  // host commands even though they aren't the TV's hostPlayerId. Populated
  // from DB on room load and updated as new remotes pair in.
  remotePlayerIds: Set<string>;
  // Lobby game voting — each non-audience player can cast one vote for the
  // next game. Cleared when a match starts or when the room returns to
  // lobby after a match. Remote/host controllers can also vote.
  gameVotes: Map<string, string>; // playerId -> gameId
}

const rooms = new Map<string, LiveRoom>(); // keyed by room code
const socketToContext = new Map<
  string,
  { roomCode: string; playerId: string; sessionToken: string }
>();

export function getRoomByCode(code: string): LiveRoom | undefined {
  return rooms.get(code);
}

// Prisma stores avatarKind as a free-form String column (the enum lives on
// the client-side type union). Defensive cast so unexpected values from
// older rows or future additions never leak through.
function normalizeAvatarKind(raw: string | null): "EMOJI" | "DRAWING" | "PHOTO" {
  if (raw === "DRAWING" || raw === "PHOTO") return raw;
  return "EMOJI";
}

function parseRgb(raw: string): { r: number; g: number; b: number } {
  const parts = raw.split(",").map((p) => Number(p.trim()));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n)))
    return { r: 0, g: 0, b: 0 };
  return {
    r: Math.max(0, Math.min(255, Math.round(parts[0]))),
    g: Math.max(0, Math.min(255, Math.round(parts[1]))),
    b: Math.max(0, Math.min(255, Math.round(parts[2]))),
  };
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
  const remotes = await prisma.player.findMany({
    where: { roomId: row.id, isRemote: true },
    select: { id: true },
  });
  const live: LiveRoom = {
    id: row.id,
    code: row.code,
    hostPlayerId: row.hostPlayerId,
    familyMode: row.familyMode,
    streamerMode: row.streamerMode,
    selectedGameId: row.selectedGameId,
    currentGameId: row.selectedGameId,
    phase: "LOBBY",
    matchId: null,
    round: null,
    phaseTimer: null,
    sockets: new Set(),
    highlights: [],
    remotePlayerIds: new Set(remotes.map((r) => r.id)),
    gameVotes: new Map(),
  };
  rooms.set(code, live);
  return live;
}

// True if the given player is authorized to issue host-level commands —
// either the TV host, or any phone paired as a remote controller.
export function canControl(playerId: string, room: LiveRoom): boolean {
  if (room.hostPlayerId && playerId === room.hostPlayerId) return true;
  return room.remotePlayerIds.has(playerId);
}

// For multi-stage games the active SubmissionKind depends on which stage we
// are on; single-stage games just return their canonical kind.
function stageSubmissionKind(gameId: string, stage: number) {
  const def = getGame(gameId);
  if (def.stages && def.stages[stage]) {
    return def.stages[stage].kind === "DRAWING" ? "DRAWING" : "TEXT";
  }
  return def.submissionKind;
}

function toGameCards(): GameCard[] {
  return GAME_LIST.map((g) => ({
    id: g.id,
    name: g.name,
    tagline: g.tagline,
    description: g.description,
    scoring: g.scoring,
    flow: g.flow,
    submissionKind: g.submissionKind,
    usesCriterion: g.usesCriterion,
    accent: g.accent,
  }));
}

export async function buildSnapshot(room: LiveRoom): Promise<RoomSnapshot> {
  const players = await prisma.player.findMany({
    where: { roomId: room.id },
    orderBy: { joinedAt: "asc" },
  });

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
      avatarColor: p.avatarColor,
      avatarEmoji: p.avatarEmoji,
      avatarKind: normalizeAvatarKind(
        (p as { avatarKind?: string | null }).avatarKind ?? null
      ),
      avatarImage: (p as { avatarImage?: string | null }).avatarImage ?? null,
      score: scoreByPlayer.get(p.id) ?? 0,
    }));

  // Remote controllers are technically audience (non-playing) but shouldn't
  // show up in the "X in audience" headline — they're backstage crew.
  const audienceCount = players.filter((p) => p.isAudience && !p.isRemote).length;

  let submittedIds: string[] = [];
  let votedIds: string[] = [];
  if (room.round) {
    const [subs, votes] = await Promise.all([
      prisma.submission.findMany({
        where: { roundId: room.round.id, stage: room.round.stage },
        select: { playerId: true },
      }),
      prisma.vote.findMany({ where: { roundId: room.round.id }, select: { voterId: true } }),
    ]);
    submittedIds = subs.map((s) => s.playerId);
    votedIds = votes.map((v) => v.voterId);
  }

  // Strip author names from reveal items until SCORE phase, to keep reveals
  // anonymous. (submissionId + authorId are kept so clients can detect "mine".)
  const revealForClient: RevealItem[] = room.round
    ? room.round.reveal.map((r) => ({
        ...r,
        authorName: room.phase === "SCORE" ? r.authorName : null,
      }))
    : [];

  // Tally lobby game votes. Build a count-per-game map and a reverse map so
  // clients can show "you voted for X" without extra roundtrips. Only votes
  // for games that still exist in the registry are counted.
  const gameVotes: Record<string, number> = {};
  const playerGameVotes: Record<string, string> = {};
  const corePlayerIds = new Set(corePlayers.map((p) => p.id));
  for (const [pid, gid] of room.gameVotes.entries()) {
    if (!GAMES[gid]) continue;
    // Include votes from any connected player (core + remote); audience
    // members don't vote to keep lobby counts meaningful.
    if (!corePlayerIds.has(pid) && !room.remotePlayerIds.has(pid)) continue;
    gameVotes[gid] = (gameVotes[gid] ?? 0) + 1;
    playerGameVotes[pid] = gid;
  }

  return {
    code: room.code,
    status: room.matchId ? "IN_MATCH" : "LOBBY",
    phase: room.phase,
    hostPlayerId: room.hostPlayerId,
    familyMode: room.familyMode,
    streamerMode: room.streamerMode,
    selectedGameId: room.selectedGameId,
    currentGameId: room.currentGameId,
    players: corePlayers,
    audienceCount,
    games: toGameCards(),
    highlights: room.highlights,
    gameVotes,
    playerGameVotes,
    round: room.round
      ? {
          number: room.round.number,
          total: room.round.total,
          gameId: room.round.gameId,
          flow: getGame(room.round.gameId).flow,
          submissionKind: stageSubmissionKind(room.round.gameId, room.round.stage),
          prompt: room.round.promptText,
          promptDetail: room.round.promptDetail,
          choices: room.round.choices,
          // Truth is only exposed to clients at REVEAL (for quiz) and SCORE.
          truth:
            room.round.truthRevealed || room.phase === "SCORE"
              ? room.round.promptTruth
              : null,
          criterionLabel: room.round.criterionHidden ? null : room.round.criterionLabel,
          criterionHidden: room.round.criterionHidden,
          phaseEndsAt: room.round.phaseEndsAt,
          submittedPlayerIds: submittedIds,
          reveal: revealForClient,
          votedVoterIds: votedIds,
          roundSummary: room.round.roundSummary,
          stage: room.round.stage,
          totalStages: room.round.totalStages,
          playerTargets: room.round.playerTargets,
          chains: room.round.chains,
          mashups: room.round.mashups,
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

  setTimeout(async () => {
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

// ---- Shared Game Engine ----

async function pickPromptAndCriterion(room: LiveRoom, usedPromptIds: Set<string>) {
  const def = getGame(room.currentGameId);
  const promptWhere = {
    gameId: def.id,
    ...(room.familyMode ? { rating: "FAMILY" as const } : {}),
  };
  const prompts = await prisma.prompt.findMany({ where: promptWhere });
  if (!prompts.length) {
    // Family-mode fallback: use the full pool if we filtered everything out.
    const all = await prisma.prompt.findMany({ where: { gameId: def.id } });
    if (!all.length) throw new Error(`No prompts seeded for ${def.id}. Run db:seed.`);
    prompts.push(...all);
  }
  const available = prompts.filter((p) => !usedPromptIds.has(p.id));
  const pool = available.length ? available : prompts;
  const prompt = pool[Math.floor(Math.random() * pool.length)];

  let criterion: { id: string; label: string } | null = null;
  if (def.usesCriterion) {
    const critWhere = {
      gameId: def.id,
      ...(room.familyMode ? { rating: "FAMILY" as const } : {}),
    };
    let criteria = await prisma.criterion.findMany({ where: critWhere });
    if (!criteria.length)
      criteria = await prisma.criterion.findMany({ where: { gameId: def.id } });
    if (!criteria.length)
      throw new Error(`No criteria seeded for ${def.id}. Run db:seed.`);
    criterion = criteria[Math.floor(Math.random() * criteria.length)];
  }
  return { prompt, criterion, def };
}

export async function startMatch(io: IO, room: LiveRoom, requesterPlayerId: string) {
  if (!canControl(requesterPlayerId, room)) throw new Error("Only the host can start.");

  // Resolve which game to play: if anyone voted, take the highest-voted game
  // (ties broken by earliest first-vote time); otherwise fall back to whatever
  // is currently selected. This replaces the old host-only picker.
  const winner = resolveVotedGame(room);
  if (winner && winner !== room.selectedGameId) {
    room.selectedGameId = winner;
    await prisma.room.update({
      where: { id: room.id },
      data: { selectedGameId: winner },
    });
  }
  if (!GAMES[room.selectedGameId])
    throw new Error("Pick a game before starting the match.");

  const corePlayers = await prisma.player.count({
    where: { roomId: room.id, isAudience: false, connected: true },
  });
  if (corePlayers < DEFAULTS.MIN_PLAYERS)
    throw new Error(`Need at least ${DEFAULTS.MIN_PLAYERS} players.`);

  // Clear lobby votes for the next round's vote.
  room.gameVotes.clear();

  room.currentGameId = room.selectedGameId;
  const match = await prisma.match.create({
    data: {
      roomId: room.id,
      gameId: room.currentGameId,
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

  const { prompt, criterion, def } = await pickPromptAndCriterion(room, usedPromptIds);
  // For games without criteria, pick a placeholder criterion row (created on the fly if missing).
  let effectiveCriterion = criterion;
  if (!effectiveCriterion) {
    effectiveCriterion = await prisma.criterion.upsert({
      where: { id: `sys-${def.id}-vote` },
      update: {},
      create: {
        id: `sys-${def.id}-vote`,
        gameId: def.id,
        label: "__vote__",
        rating: "FAMILY",
      },
    });
  }

  const submitSeconds = def.submitSeconds ?? DEFAULTS.SUBMIT_SECONDS;
  const round = await prisma.round.create({
    data: {
      matchId: match.id,
      roundNumber: nextRoundNumber,
      promptId: prompt.id,
      criterionId: effectiveCriterion.id,
      phase: "SUBMIT",
      phaseEndsAt: new Date(Date.now() + submitSeconds * 1000),
    },
  });
  await prisma.match.update({
    where: { id: match.id },
    data: { currentRound: nextRoundNumber },
  });

  let choices: string[] | null = null;
  if (prompt.choices) {
    try {
      const parsed = JSON.parse(prompt.choices);
      if (Array.isArray(parsed)) choices = parsed.map((c) => String(c));
    } catch {
      choices = null;
    }
  }

  const totalStages = def.stages?.length ?? 1;
  room.phase = "SUBMIT";
  room.round = {
    id: round.id,
    number: nextRoundNumber,
    total: match.totalRounds,
    gameId: def.id,
    promptText: prompt.text,
    promptTruth: prompt.truth ?? null,
    promptDetail: prompt.detail ?? null,
    choices,
    criterionLabel: def.usesCriterion ? effectiveCriterion.label : null,
    criterionHidden: def.usesCriterion && def.secretCriterion,
    phaseEndsAt: round.phaseEndsAt!.getTime(),
    reveal: [],
    truthRevealed: false,
    roundSummary: null,
    stage: 0,
    totalStages,
    playerTargets: null,
    chains: null,
    mashups: null,
  };
  // For multi-stage games, build the first stage's per-player targets so the
  // phones know what to show.
  if (def.stages) {
    room.round.playerTargets = await buildStageTargets(room, 0);
    // First stage also uses the stage's own submitSeconds if provided.
    const s0 = def.stages[0].seconds ?? submitSeconds;
    room.round.phaseEndsAt = Date.now() + s0 * 1000;
    await prisma.round.update({
      where: { id: round.id },
      data: {
        phaseEndsAt: new Date(room.round.phaseEndsAt),
        totalStages,
      },
    });
    schedulePhaseEnd(io, room, s0, () => advanceSubmitStage(io, room));
  } else {
    schedulePhaseEnd(io, room, submitSeconds, () => enterRevealPhase(io, room));
  }
  await broadcast(io, room);
}

// Assemble the per-player target map for a given SUBMIT stage of a
// chain/combo game. Returns null for single-stage games.
async function buildStageTargets(
  room: LiveRoom,
  stage: number
): Promise<Record<string, PlayerStageTarget> | null> {
  if (!room.round) return null;
  const def = getGame(room.round.gameId);
  if (!def.stages) return null;
  const stageDef = def.stages[stage];
  if (!stageDef) return null;

  const players = await prisma.player.findMany({
    where: { roomId: room.id, isAudience: false, connected: true },
    orderBy: { joinedAt: "asc" },
  });
  if (!players.length) return {};
  const nameById = new Map(players.map((p) => [p.id, p.displayName]));

  const targets: Record<string, PlayerStageTarget> = {};

  // Chain: each stage (after 0) routes based on player order with a shift.
  if (def.flow === "chain") {
    if (stage === 0 || stageDef.targetRouting === "prompt-bank") {
      // Seed phase: each player sees a fresh prompt from the bank. Or if the
      // stage explicitly wants a fresh prompt, do the same.
      const allPrompts = await prisma.prompt.findMany({
        where: {
          gameId: def.id,
          ...(room.familyMode ? { rating: "FAMILY" as const } : {}),
        },
      });
      const fallback = allPrompts.length
        ? allPrompts
        : await prisma.prompt.findMany({ where: { gameId: def.id } });
      for (const p of players) {
        const seed = fallback.length
          ? fallback[Math.floor(Math.random() * fallback.length)]
          : null;
        targets[p.id] = {
          kind: stageDef.kind === "DRAWING" ? "DRAWING" : "TEXT",
          prompt: stage === 0 ? null : seed?.text ?? null,
          inputKind: null,
          inputText: stage === 0 ? null : seed?.text ?? null,
          fromPlayerName: null,
        };
      }
      return targets;
    }
    // Route from previous stage: player i at stage s receives player (i-1)'s
    // submission from stage s-1 (cyclic).
    const prevStage = stage - 1;
    const prevSubs = await prisma.submission.findMany({
      where: { roundId: room.round.id, stage: prevStage },
    });
    const subByPlayer = new Map(prevSubs.map((s) => [s.playerId, s]));
    for (let i = 0; i < players.length; i++) {
      const sourceIdx = (i - 1 + players.length) % players.length;
      const sourcePlayer = players[sourceIdx];
      const sourceSub = subByPlayer.get(sourcePlayer.id);
      const prevStageDef = def.stages[prevStage];
      const inputKind = prevStageDef.kind === "DRAWING" ? "DRAWING" : "TEXT";
      targets[players[i].id] = {
        kind: stageDef.kind === "DRAWING" ? "DRAWING" : "TEXT",
        prompt: null,
        inputKind,
        inputText: sourceSub?.text ?? null,
        fromPlayerName: nameById.get(sourcePlayer.id) ?? null,
      };
    }
    return targets;
  }

  // Combo: all stages are independent; everybody sees the same shared prompt
  // (the room's roll).
  if (def.flow === "combo") {
    for (const p of players) {
      targets[p.id] = {
        kind: stageDef.kind === "DRAWING" ? "DRAWING" : "TEXT",
        prompt: null,
        inputKind: null,
        inputText: null,
        fromPlayerName: null,
      };
    }
    return targets;
  }

  return null;
}

// Called when the current SUBMIT stage is complete (timer expired or all
// players submitted). Advances to the next stage or moves into REVEAL.
async function advanceSubmitStage(io: IO, room: LiveRoom) {
  if (!room.round) return;
  const def = getGame(room.round.gameId);
  if (!def.stages) {
    return enterRevealPhase(io, room);
  }
  const nextStage = room.round.stage + 1;
  if (nextStage >= def.stages.length) {
    return enterRevealPhase(io, room);
  }
  room.round.stage = nextStage;
  room.round.playerTargets = await buildStageTargets(room, nextStage);
  const stageDef = def.stages[nextStage];
  const seconds = stageDef.seconds ?? DEFAULTS.SUBMIT_SECONDS;
  room.round.phaseEndsAt = Date.now() + seconds * 1000;
  await prisma.round.update({
    where: { id: room.round.id },
    data: { stage: nextStage, phaseEndsAt: new Date(room.round.phaseEndsAt) },
  });
  schedulePhaseEnd(io, room, seconds, () => advanceSubmitStage(io, room));
  await broadcast(io, room);
}

function schedulePhaseEnd(io: IO, room: LiveRoom, seconds: number, next: () => void) {
  clearPhaseTimer(room);
  room.phaseTimer = setTimeout(next, seconds * 1000);
}

async function enterRevealPhase(io: IO, room: LiveRoom) {
  if (!room.round) return;
  const def = getGame(room.round.gameId);

  // Reaction games skip REVEAL + VOTE entirely — score directly from submissions.
  if (def.flow === "reaction") {
    return enterScorePhase(io, room);
  }

  const submissions = await prisma.submission.findMany({
    where: { roundId: room.round.id },
    include: { player: { select: { id: true, displayName: true, avatarColor: true, avatarEmoji: true } } },
  });

  let reveal: RevealItem[] = [];
  let chains: ChainReveal[] | null = null;
  let mashups: MashupReveal[] | null = null;

  if (def.flow === "chain" && def.stages) {
    // Stroke of Genius: assemble one ChainReveal per origin player. Stage 0
    // submissions are the seed phrases; each stage thereafter was written by
    // the player cyclically shifted down, so we walk the shift to reconstruct
    // each chain end-to-end.
    const players = await prisma.player.findMany({
      where: { roomId: room.id, isAudience: false, connected: true },
      orderBy: { joinedAt: "asc" },
    });
    const n = players.length;
    const byPlayerStage = new Map<string, Map<number, typeof submissions[number]>>();
    for (const s of submissions) {
      if (!byPlayerStage.has(s.playerId)) byPlayerStage.set(s.playerId, new Map());
      byPlayerStage.get(s.playerId)!.set(s.stage, s);
    }
    chains = [];
    for (let originIdx = 0; originIdx < n; originIdx++) {
      const origin = players[originIdx];
      const originSeed = byPlayerStage.get(origin.id)?.get(0);
      if (!originSeed) continue;
      const entries: ChainReveal["entries"] = [];
      entries.push({
        kind: "TEXT",
        text: originSeed.text,
        playerName: origin.displayName,
        avatarColor: origin.avatarColor,
        avatarEmoji: origin.avatarEmoji,
      });
      // Walk each subsequent stage. The router uses (i-1+n)%n: player i at
      // stage s saw player (i-1)'s stage-(s-1) submission. So to follow
      // origin's chain, at each stage we shift +1 from the previous stage's
      // actor.
      let currentIdx = originIdx;
      for (let s = 1; s < def.stages.length; s++) {
        currentIdx = (currentIdx + 1) % n;
        const actor = players[currentIdx];
        const sub = byPlayerStage.get(actor.id)?.get(s);
        if (!sub) break;
        const stageDef = def.stages[s];
        entries.push({
          kind: stageDef.kind === "DRAWING" ? "DRAWING" : "TEXT",
          text: sub.text,
          playerName: actor.displayName,
          avatarColor: actor.avatarColor,
          avatarEmoji: actor.avatarEmoji,
        });
      }
      chains.push({ originPlayerName: origin.displayName, entries });
    }
    // Chain games: no individual vote targets, we just play the reveal and
    // go to VOTE where players pick their favorite chain (by origin player
    // submission id — we use the stage-0 seed submission id as the key).
    reveal = [];
  } else if (def.flow === "combo" && def.stages) {
    // Mash-Up Doodle: pair each stage-0 icon with a stage-1 slogan from a
    // different player (cyclic shift). Display shown as paired cards; the
    // vote target is the icon (stage 0) submission's id.
    const players = await prisma.player.findMany({
      where: { roomId: room.id, isAudience: false, connected: true },
      orderBy: { joinedAt: "asc" },
    });
    const n = players.length;
    const stage0 = submissions.filter((s) => s.stage === 0);
    const stage1 = submissions.filter((s) => s.stage === 1);
    const byPlayerS1 = new Map(stage1.map((s) => [s.playerId, s]));
    mashups = [];
    for (let i = 0; i < n; i++) {
      const iconPlayer = players[i];
      const icon = stage0.find((s) => s.playerId === iconPlayer.id);
      if (!icon) continue;
      // Shift sloganist by +1 so you never pair your own icon with your own slogan.
      const sloganPlayer = players[(i + 1) % n];
      const slogan = byPlayerS1.get(sloganPlayer.id);
      if (!slogan) continue;
      mashups.push({
        id: icon.id,
        iconText: icon.text,
        iconAuthorId: iconPlayer.id,
        iconAuthorName: iconPlayer.displayName,
        sloganText: slogan.text,
        sloganAuthorId: sloganPlayer.id,
        sloganAuthorName: sloganPlayer.displayName,
      });
    }
    // Use mashup list as reveal items so the vote handler can find them by id.
    reveal = mashups.map((m) => ({
      submissionId: m.id,
      authorId: m.iconAuthorId,
      authorName: m.iconAuthorName,
      text: m.iconText,
      isTruth: false,
    }));
  } else {
    const items: RevealItem[] = submissions.map((s) => ({
      submissionId: s.id,
      authorId: s.playerId,
      authorName: s.player.displayName,
      text: s.text,
      isTruth: false,
    }));
    // For fib games, inject the hidden truth as one of the items.
    if (def.scoring === "fib" && room.round.promptTruth) {
      items.push({
        submissionId: null,
        authorId: null,
        authorName: null,
        text: room.round.promptTruth,
        isTruth: true,
      });
    }
    reveal = shuffle(items);
  }

  const revealSeconds = def.revealSeconds ?? DEFAULTS.REVEAL_SECONDS;
  room.phase = "REVEAL";
  room.round.phaseEndsAt = Date.now() + revealSeconds * 1000;
  room.round.reveal = reveal;
  room.round.chains = chains;
  room.round.mashups = mashups;
  // Quiz games unveil the truth during REVEAL (no separate vote phase).
  room.round.truthRevealed = def.flow === "quiz";
  await prisma.round.update({
    where: { id: room.round.id },
    data: { phase: "REVEAL", phaseEndsAt: new Date(room.round.phaseEndsAt) },
  });
  // Quiz skips VOTE and goes straight to SCORE.
  const next =
    def.flow === "quiz"
      ? () => enterScorePhase(io, room)
      : () => enterVotePhase(io, room);
  schedulePhaseEnd(io, room, revealSeconds, next);
  await broadcast(io, room);
}

async function enterVotePhase(io: IO, room: LiveRoom) {
  if (!room.round) return;
  const def = getGame(room.round.gameId);
  const voteSeconds = def.voteSeconds ?? DEFAULTS.VOTE_SECONDS;
  room.phase = "VOTE";
  room.round.criterionHidden = false; // secret criterion revealed here (if any).
  room.round.phaseEndsAt = Date.now() + voteSeconds * 1000;
  await prisma.round.update({
    where: { id: room.round.id },
    data: { phase: "VOTE", phaseEndsAt: new Date(room.round.phaseEndsAt) },
  });
  schedulePhaseEnd(io, room, voteSeconds, () => enterScorePhase(io, room));
  await broadcast(io, room);
}

async function enterScorePhase(io: IO, room: LiveRoom) {
  if (!room.round) return;
  const def = getGame(room.round.gameId);
  const [submissions, votes, players] = await Promise.all([
    prisma.submission.findMany({ where: { roundId: room.round.id } }),
    prisma.vote.findMany({ where: { roundId: room.round.id } }),
    prisma.player.findMany({ where: { roomId: room.id } }),
  ]);
  const audienceSet = new Set(players.filter((p) => p.isAudience).map((p) => p.id));
  const submissionAuthor = new Map(submissions.map((s) => [s.id, s.playerId]));

  const scoreDelta = new Map<string, number>();
  const scoreEvents: { roundId: string; playerId: string; points: number; reason: string }[] = [];
  // Last-round drama: every point counts double so comebacks are always live.
  const multiplier =
    room.round.number === room.round.total ? DEFAULTS.FINAL_ROUND_MULTIPLIER : 1;
  const add = (playerId: string, pts: number, reason: string) => {
    const final = pts * multiplier;
    scoreDelta.set(playerId, (scoreDelta.get(playerId) ?? 0) + final);
    scoreEvents.push({ roundId: room.round!.id, playerId, points: final, reason });
  };

  if (def.scoring === "quiz") {
    // Quiz: correct choice wins the wager; wrong loses it (floored at 0 delta).
    const truth = room.round.promptTruth;
    for (const s of submissions) {
      let choice: string | null = null;
      let wager = 100;
      try {
        const parsed = JSON.parse(s.text);
        if (parsed && typeof parsed === "object") {
          choice = typeof parsed.choice === "string" ? parsed.choice : null;
          if (typeof parsed.wager === "number")
            wager = Math.max(100, Math.min(1000, Math.round(parsed.wager)));
        }
      } catch {
        // Malformed submission → no choice, minimum wager.
      }
      add(s.playerId, 50, "quiz_participation");
      if (truth && choice === truth) {
        add(s.playerId, wager, "quiz_correct");
      }
      // Wrong answers don't deduct (positive-sum scoring keeps it breezy);
      // the upside of a big wager is what makes it interesting.
    }
  } else if (def.scoring === "percent") {
    // Guesspionage: the prompt's `truth` is a 0–100 number. Players submit a
    // numeric guess; points scale with closeness. Bullseye (≤3 pts off) gets
    // a big bonus.
    const target = Math.max(0, Math.min(100, Number(room.round.promptTruth ?? "0")));
    for (const s of submissions) {
      let guess = 0;
      try {
        const parsed = JSON.parse(s.text);
        guess = Math.max(0, Math.min(100, Number(parsed?.value) || 0));
      } catch {
        guess = 0;
      }
      const diff = Math.abs(guess - target);
      // 0 diff → 1000, 100 diff → 0. Linear falloff is simple and readable.
      const proximity = Math.max(0, Math.round(1000 - diff * 10));
      add(s.playerId, 50, "percent_participation");
      if (proximity > 0) add(s.playerId, proximity, "percent_proximity");
      if (diff <= 3) add(s.playerId, 500, "percent_bullseye");
    }
  } else if (def.scoring === "herd") {
    // Group Mentality: cluster similar short-text answers by normalized form
    // and reward players whose answer was picked by the crowd.
    const norm = (t: string) =>
      t
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .split(/\s+/)[0] ?? "";
    const groups = new Map<string, string[]>();
    for (const s of submissions) {
      const key = norm(s.text);
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s.playerId);
    }
    for (const s of submissions) add(s.playerId, 50, "herd_participation");
    for (const [, memberIds] of groups.entries()) {
      if (memberIds.length < 2) continue;
      // Bigger herds = bigger payout: 200 per co-matcher, capped at 1000.
      const reward = Math.min(1000, (memberIds.length - 1) * 200 + 200);
      for (const pid of memberIds) add(pid, reward, "herd_matched");
    }
  } else if (def.scoring === "trace") {
    // Trace Race: client submits {score, accuracy, timeMs}. Award the raw
    // score plus participation + a top-finisher bonus.
    interface TracePayload {
      playerId: string;
      score: number;
      accuracy: number;
      timeMs: number;
    }
    const parsed: TracePayload[] = [];
    for (const s of submissions) {
      try {
        const p = JSON.parse(s.text);
        parsed.push({
          playerId: s.playerId,
          score: Math.max(0, Math.min(9999, Math.round(Number(p?.score) || 0))),
          accuracy: Math.max(0, Math.min(100, Math.round(Number(p?.accuracy) || 0))),
          timeMs: Math.max(0, Math.min(60_000, Math.round(Number(p?.timeMs) || 0))),
        });
      } catch {
        parsed.push({ playerId: s.playerId, score: 0, accuracy: 0, timeMs: 0 });
      }
      add(s.playerId, 50, "trace_participation");
    }
    for (const p of parsed) {
      if (p.score > 0) add(p.playerId, p.score, "trace_score");
    }
    const ranked = [...parsed].sort((a, b) => b.score - a.score);
    if (ranked.length && ranked[0].score > 0) {
      add(ranked[0].playerId, 500, "trace_top");
      if (ranked.length > 1 && ranked[1].score > 0)
        add(ranked[1].playerId, 250, "trace_second");
    }
  } else if (def.scoring === "color") {
    // Slider Wars: client submits {r,g,b}. Target color comes from promptTruth
    // as "r,g,b". Score by proximity (linear inverse of Euclidean distance).
    const target = parseRgb(room.round.promptTruth ?? "");
    for (const s of submissions) {
      let r = 0,
        g = 0,
        b = 0;
      try {
        const p = JSON.parse(s.text);
        r = Math.max(0, Math.min(255, Math.round(Number(p?.r) || 0)));
        g = Math.max(0, Math.min(255, Math.round(Number(p?.g) || 0)));
        b = Math.max(0, Math.min(255, Math.round(Number(p?.b) || 0)));
      } catch {
        // leave zeros
      }
      const dr = r - target.r;
      const dg = g - target.g;
      const db = b - target.b;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      // Max distance = sqrt(3*255^2) ≈ 441. Map to 0..1000 (higher = closer).
      const points = Math.max(0, Math.round(1000 - (dist / 441) * 1000));
      add(s.playerId, 50, "color_participation");
      if (points > 0) add(s.playerId, points, "color_proximity");
      // Bullseye: within ~25 in combined Euclidean distance.
      if (dist <= 25) add(s.playerId, 500, "color_bullseye");
    }
  } else if (def.scoring === "reaction") {
    // Tap Rally: parse each player's TAP payload and award proportional points.
    // The top scorer gets a round bonus. Audience players (if any submitted)
    // don't affect ranking.
    interface TapPayload {
      playerId: string;
      score: number;
      hits: number;
    }
    const parsed: TapPayload[] = [];
    for (const s of submissions) {
      try {
        const p = JSON.parse(s.text);
        const score = Math.max(0, Math.min(99999, Math.round(Number(p?.score) || 0)));
        const hits = Math.max(0, Math.min(9999, Math.round(Number(p?.hits) || 0)));
        parsed.push({ playerId: s.playerId, score, hits });
      } catch {
        parsed.push({ playerId: s.playerId, score: 0, hits: 0 });
      }
      add(s.playerId, 50, "reaction_participation");
    }
    for (const p of parsed) {
      // Scale raw tap score into points — ~10 points per hit (score is already
      // weighted on the client by speed bonus).
      add(p.playerId, p.score, "tap_score");
    }
    const ranked = [...parsed].sort((a, b) => b.score - a.score);
    if (ranked.length && ranked[0].score > 0) {
      add(ranked[0].playerId, 500, "tap_top");
      if (ranked.length > 1 && ranked[1].score > 0) {
        add(ranked[1].playerId, 250, "tap_second");
      }
    }
  } else if (def.scoring === "chain") {
    // Stroke of Genius: every participant across every stage gets a
    // participation kicker; the winning chain's origin + every actor in it
    // split the big prize.
    for (const s of submissions) add(s.playerId, 50, "chain_participation");
    const chains = room.round.chains ?? [];
    // Map each chain's vote target (seed submission id) → its actor playerIds.
    // We locate the seed submission by matching origin name → seed row.
    const seedIdByOrigin = new Map<string, { id: string; actorIds: string[] }>();
    const submissionsByStagePlayer = new Map<string, typeof submissions[number]>();
    for (const s of submissions) submissionsByStagePlayer.set(`${s.stage}:${s.playerId}`, s);
    // Rebuild the actor order from players (same as buildStageTargets).
    const coreOrdered = players
      .filter((p) => !p.isAudience)
      .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
    for (let i = 0; i < coreOrdered.length; i++) {
      const origin = coreOrdered[i];
      const seed = submissionsByStagePlayer.get(`0:${origin.id}`);
      if (!seed) continue;
      const actorIds: string[] = [origin.id];
      let idx = i;
      const stageCount = def.stages?.length ?? 1;
      for (let s = 1; s < stageCount; s++) {
        idx = (idx + 1) % coreOrdered.length;
        actorIds.push(coreOrdered[idx].id);
      }
      seedIdByOrigin.set(origin.id, { id: seed.id, actorIds });
    }
    // Tally votes by seed submission id.
    const tally = new Map<string, number>();
    for (const v of votes) {
      if (!v.submissionId) continue;
      const w = audienceSet.has(v.voterId) ? DEFAULTS.AUDIENCE_VOTE_WEIGHT : 1;
      tally.set(v.submissionId, (tally.get(v.submissionId) ?? 0) + w);
    }
    let topSeedId: string | null = null;
    let topScore = 0;
    for (const [sid, score] of tally.entries()) {
      if (score > topScore) {
        topScore = score;
        topSeedId = sid;
      }
    }
    // Every vote cast on a chain rewards every actor in that chain.
    for (const [seedId, weight] of tally.entries()) {
      const meta = Array.from(seedIdByOrigin.values()).find((m) => m.id === seedId);
      if (!meta) continue;
      const reward = Math.round(200 * weight);
      for (const pid of meta.actorIds) add(pid, reward, "chain_votes");
    }
    if (topSeedId) {
      const winning = Array.from(seedIdByOrigin.values()).find((m) => m.id === topSeedId);
      if (winning) for (const pid of winning.actorIds) add(pid, 500, "chain_winning");
    }
    void chains;
  } else if (def.scoring === "combo") {
    // Mash-Up Doodle: each mashup card bundles an icon author + a slogan
    // author. Votes cast on a card reward both contributors, with a top-pair
    // bonus to the winning duo.
    const mashups = room.round.mashups ?? [];
    const cardById = new Map(mashups.map((m) => [m.id, m]));
    for (const s of submissions) add(s.playerId, 50, "combo_participation");
    const tally = new Map<string, number>();
    for (const v of votes) {
      if (!v.submissionId) continue;
      const w = audienceSet.has(v.voterId) ? DEFAULTS.AUDIENCE_VOTE_WEIGHT : 1;
      tally.set(v.submissionId, (tally.get(v.submissionId) ?? 0) + w);
    }
    let topId: string | null = null;
    let topScore = 0;
    for (const [id, score] of tally.entries()) {
      if (score > topScore) {
        topScore = score;
        topId = id;
      }
    }
    for (const [id, weight] of tally.entries()) {
      const card = cardById.get(id);
      if (!card) continue;
      const reward = Math.round(250 * weight);
      add(card.iconAuthorId, reward, "combo_votes");
      add(card.sloganAuthorId, reward, "combo_votes");
    }
    if (topId) {
      const top = cardById.get(topId);
      if (top) {
        add(top.iconAuthorId, 750, "combo_top");
        add(top.sloganAuthorId, 750, "combo_top");
      }
    }
  } else if (def.scoring === "take") {
    // Participation + votes-received + top-take + sharp-voter bonus.
    const tally = new Map<string, number>();
    const voterCountBySubmission = new Map<string, number>();
    for (const s of submissions) tally.set(s.id, 0);
    for (const v of votes) {
      if (!v.submissionId) continue;
      const w = audienceSet.has(v.voterId) ? DEFAULTS.AUDIENCE_VOTE_WEIGHT : 1;
      tally.set(v.submissionId, (tally.get(v.submissionId) ?? 0) + w);
      voterCountBySubmission.set(
        v.submissionId,
        (voterCountBySubmission.get(v.submissionId) ?? 0) + 1
      );
    }
    let topSubmissionId: string | null = null;
    let topScore = -1;
    for (const [sid, score] of tally.entries()) {
      if (score > topScore) {
        topSubmissionId = sid;
        topScore = score;
      }
    }
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
  } else {
    // Fib scoring:
    //  - +50 for writing a believable fake (participation)
    //  - +750 for every voter who picks the hidden truth
    //  - +500 for every person fooled into voting for your fib
    //  - Audience votes weighted lighter on *fooling* (not on detecting truth)
    const truthItem = room.round.reveal.find((r) => r.isTruth);
    for (const s of submissions) add(s.playerId, 50, "fib_participation");
    for (const v of votes) {
      if (v.forTruth) {
        add(v.voterId, 750, "detected_truth");
        continue;
      }
      if (!v.submissionId) continue;
      const author = submissionAuthor.get(v.submissionId);
      if (author && author !== v.voterId) {
        const weight = audienceSet.has(v.voterId) ? DEFAULTS.AUDIENCE_VOTE_WEIGHT : 1;
        add(author, Math.round(500 * weight), "fooled_a_voter");
      }
    }
    void truthItem;
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
    room.highlights = await computeHighlights(room);
    await prisma.match.update({
      where: { id: room.matchId },
      data: { status: "FINISHED", endedAt: new Date() },
    });
  }
  await prisma.room.update({ where: { id: room.id }, data: { status: "LOBBY" } });
  room.phase = "MATCH_END";
  await broadcast(io, room);
  setTimeout(async () => {
    room.phase = "LOBBY";
    room.matchId = null;
    room.round = null;
    room.highlights = [];
    // Fresh round of game voting for the next match.
    room.gameVotes.clear();
    await broadcast(io, room);
  }, 20_000);
}

// MVP awards for the post-match celebration screen. Computed from the match's
// rounds + score events so the host TV can display a Jackbox-style highlight
// reel when the final buzzer sounds.
async function computeHighlights(room: LiveRoom): Promise<MatchHighlight[]> {
  if (!room.matchId) return [];
  const [players, rounds, events, submissions, votes] = await Promise.all([
    prisma.player.findMany({ where: { roomId: room.id } }),
    prisma.round.findMany({
      where: { matchId: room.matchId },
      orderBy: { roundNumber: "asc" },
    }),
    prisma.scoreEvent.findMany({
      where: { round: { matchId: room.matchId } },
    }),
    prisma.submission.findMany({
      where: { round: { matchId: room.matchId } },
    }),
    prisma.vote.findMany({
      where: { round: { matchId: room.matchId } },
    }),
  ]);
  const playerById = new Map(players.map((p) => [p.id, p]));
  const highlights: MatchHighlight[] = [];
  const makeAward = (
    id: string,
    title: string,
    playerId: string | null,
    detail: string
  ): MatchHighlight => {
    const player = playerId ? playerById.get(playerId) ?? null : null;
    return {
      id,
      title,
      playerId,
      playerName: player?.displayName ?? "—",
      avatarColor: player?.avatarColor ?? "#ff4f7b",
      avatarEmoji: player?.avatarEmoji ?? "🏆",
      detail,
    };
  };

  // --- Top Scorer (MVP) ---
  const totals = new Map<string, number>();
  for (const e of events)
    totals.set(e.playerId, (totals.get(e.playerId) ?? 0) + e.points);
  let mvpId: string | null = null;
  let mvpScore = -Infinity;
  for (const [pid, pts] of totals.entries()) {
    if (pts > mvpScore) {
      mvpId = pid;
      mvpScore = pts;
    }
  }
  if (mvpId) {
    highlights.push(
      makeAward("mvp", "Champion", mvpId, `${mvpScore.toLocaleString()} pts`)
    );
  }

  // --- Biggest Round ---
  let bigRoundPlayer: string | null = null;
  let bigRoundDelta = 0;
  let bigRoundNumber = 0;
  const byRoundPlayer = new Map<string, Map<string, number>>();
  for (const e of events) {
    if (!byRoundPlayer.has(e.roundId)) byRoundPlayer.set(e.roundId, new Map());
    const inner = byRoundPlayer.get(e.roundId)!;
    inner.set(e.playerId, (inner.get(e.playerId) ?? 0) + e.points);
  }
  for (const round of rounds) {
    const inner = byRoundPlayer.get(round.id);
    if (!inner) continue;
    for (const [pid, pts] of inner.entries()) {
      if (pts > bigRoundDelta) {
        bigRoundDelta = pts;
        bigRoundPlayer = pid;
        bigRoundNumber = round.roundNumber;
      }
    }
  }
  if (bigRoundPlayer && bigRoundDelta > 0) {
    highlights.push(
      makeAward(
        "big_round",
        "Biggest Round",
        bigRoundPlayer,
        `+${bigRoundDelta.toLocaleString()} in Round ${bigRoundNumber}`
      )
    );
  }

  // --- Sharpest Voter (fib-truth detections + sharp-voting reasons) ---
  const sharpScores = new Map<string, number>();
  for (const e of events) {
    if (e.reason === "detected_truth" || e.reason === "sharp_voting") {
      sharpScores.set(e.playerId, (sharpScores.get(e.playerId) ?? 0) + e.points);
    }
  }
  let sharpId: string | null = null;
  let sharpBest = 0;
  for (const [pid, pts] of sharpScores.entries()) {
    if (pts > sharpBest) {
      sharpBest = pts;
      sharpId = pid;
    }
  }
  if (sharpId) {
    highlights.push(
      makeAward(
        "sharp_voter",
        "Sharpest Voter",
        sharpId,
        `+${sharpBest.toLocaleString()} pts from clutch picks`
      )
    );
  }

  // --- Master of Fibs (fooled_a_voter totals) ---
  const fibScores = new Map<string, number>();
  let fooledTotal = 0;
  const submissionAuthor = new Map(submissions.map((s) => [s.id, s.playerId]));
  for (const v of votes) {
    if (!v.forTruth && v.submissionId) {
      const author = submissionAuthor.get(v.submissionId);
      if (author && author !== v.voterId) {
        fibScores.set(author, (fibScores.get(author) ?? 0) + 1);
        fooledTotal++;
      }
    }
  }
  let fibKingId: string | null = null;
  let fibBest = 0;
  for (const [pid, n] of fibScores.entries()) {
    if (n > fibBest) {
      fibBest = n;
      fibKingId = pid;
    }
  }
  if (fibKingId && fibBest > 0) {
    highlights.push(
      makeAward(
        "fib_king",
        "Master of Fibs",
        fibKingId,
        `Fooled ${fibBest} of ${fooledTotal} votes`
      )
    );
  }

  // --- Speed Demon: most speed bonuses across the match ---
  const speedScores = new Map<string, number>();
  for (const e of events) {
    if (e.reason.startsWith("speed_bonus")) {
      speedScores.set(e.playerId, (speedScores.get(e.playerId) ?? 0) + e.points);
    }
  }
  let speedId: string | null = null;
  let speedBest = 0;
  for (const [pid, pts] of speedScores.entries()) {
    if (pts > speedBest) {
      speedBest = pts;
      speedId = pid;
    }
  }
  if (speedId) {
    highlights.push(
      makeAward(
        "speed_demon",
        "Speed Demon",
        speedId,
        `+${speedBest.toLocaleString()} in early-bird bonuses`
      )
    );
  }

  return highlights;
}

export async function hostNextPhase(io: IO, room: LiveRoom, requesterPlayerId: string) {
  if (!canControl(requesterPlayerId, room)) throw new Error("Only the host can advance.");
  const def = room.round ? getGame(room.round.gameId) : null;
  if (room.phase === "SUBMIT") return enterRevealPhase(io, room);
  if (room.phase === "REVEAL") {
    // Quiz skips VOTE; reaction never reaches REVEAL but guard anyway.
    if (def?.flow === "quiz" || def?.flow === "reaction") {
      return enterScorePhase(io, room);
    }
    return enterVotePhase(io, room);
  }
  if (room.phase === "VOTE") return enterScorePhase(io, room);
  if (room.phase === "SCORE") return advanceToNextRound(io, room);
  if (room.phase === "MATCH_END") {
    room.phase = "LOBBY";
    room.matchId = null;
    room.round = null;
    room.gameVotes.clear();
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
  if (player.isAudience) throw new Error("Audience members can't submit answers.");
  const def = getGame(room.round.gameId);

  // Normalize the submission per kind. `text` arrives pre-moderated for TEXT;
  // for other kinds the client sends JSON which we validate + re-serialize.
  let storedText = text;
  if (def.submissionKind === "DRAWING") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("Drawing payload was malformed.");
    }
    if (!parsed || typeof parsed !== "object")
      throw new Error("Drawing payload was malformed.");
    const clamped = clampDrawing(parsed as Parameters<typeof clampDrawing>[0]);
    if (!clamped.s.length) throw new Error("Your canvas is empty — draw something first!");
    storedText = JSON.stringify(clamped);
  } else if (def.submissionKind === "QUIZ") {
    let parsed: { choice?: unknown; wager?: unknown };
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("Quiz submission was malformed.");
    }
    const choice = typeof parsed.choice === "string" ? parsed.choice : null;
    if (!choice) throw new Error("Pick one of the choices.");
    if (room.round.choices && !room.round.choices.includes(choice))
      throw new Error("That choice isn't on the board.");
    const wager = Math.max(
      100,
      Math.min(1000, Math.round(Number(parsed.wager) || 100))
    );
    storedText = JSON.stringify({ choice, wager });
  } else if (def.submissionKind === "PERCENT") {
    let parsed: { value?: unknown };
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("Guess payload was malformed.");
    }
    const value = Math.max(0, Math.min(100, Math.round(Number(parsed.value) || 0)));
    storedText = JSON.stringify({ value });
  } else if (def.submissionKind === "TRACE") {
    let parsed: { score?: unknown; accuracy?: unknown; timeMs?: unknown };
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("Trace payload was malformed.");
    }
    const score = Math.max(0, Math.min(9999, Math.round(Number(parsed.score) || 0)));
    const accuracy = Math.max(0, Math.min(100, Math.round(Number(parsed.accuracy) || 0)));
    const timeMs = Math.max(0, Math.min(60_000, Math.round(Number(parsed.timeMs) || 0)));
    storedText = JSON.stringify({ score, accuracy, timeMs });
  } else if (def.submissionKind === "COLOR") {
    let parsed: { r?: unknown; g?: unknown; b?: unknown };
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("Color payload was malformed.");
    }
    const r = Math.max(0, Math.min(255, Math.round(Number(parsed.r) || 0)));
    const g = Math.max(0, Math.min(255, Math.round(Number(parsed.g) || 0)));
    const b = Math.max(0, Math.min(255, Math.round(Number(parsed.b) || 0)));
    storedText = JSON.stringify({ r, g, b });
  } else if (def.submissionKind === "TAP") {
    let parsed: { score?: unknown; hits?: unknown; misses?: unknown; fastestMs?: unknown };
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("Tap race payload was malformed.");
    }
    const score = Math.max(0, Math.min(99999, Math.round(Number(parsed.score) || 0)));
    const hits = Math.max(0, Math.min(9999, Math.round(Number(parsed.hits) || 0)));
    const misses = Math.max(0, Math.min(9999, Math.round(Number(parsed.misses) || 0)));
    const fastestMs = Math.max(0, Math.min(60000, Math.round(Number(parsed.fastestMs) || 0)));
    storedText = JSON.stringify({ score, hits, misses, fastestMs });
  }

  const stage = room.round.stage;
  // For multi-stage games the active kind depends on the stage definition,
  // not the game's default submissionKind.
  const stageKind =
    def.stages && def.stages[stage]
      ? def.stages[stage].kind === "DRAWING"
        ? "DRAWING"
        : "TEXT"
      : def.submissionKind;

  const existing = await prisma.submission.findUnique({
    where: {
      roundId_playerId_stage: { roundId: room.round.id, playerId, stage },
    },
  });
  const isFirstSubmission = !existing;

  await prisma.submission.upsert({
    where: {
      roundId_playerId_stage: { roundId: room.round.id, playerId, stage },
    },
    update: { text: storedText, kind: stageKind },
    create: {
      roundId: room.round.id,
      playerId,
      stage,
      text: storedText,
      kind: stageKind,
    },
  });

  // Jackbox-style speed bonus for take/fib games — the first three submitters
  // each round bank a kicker. Awarded once per round per player on their first
  // submission (edits don't re-trigger it). Reaction/quiz games have their
  // own pacing pressure, so we skip the bonus there.
  if (
    isFirstSubmission &&
    (def.scoring === "take" || def.scoring === "fib")
  ) {
    const submittedCount = await prisma.submission.count({
      where: { roundId: room.round.id, stage },
    });
    // submittedCount already includes the row we just created.
    const rank = submittedCount; // 1 = first, 2 = second, 3 = third
    const bonus = DEFAULTS.SPEED_BONUSES[rank - 1];
    if (bonus) {
      const multiplier =
        room.round.number === room.round.total ? DEFAULTS.FINAL_ROUND_MULTIPLIER : 1;
      await prisma.scoreEvent.create({
        data: {
          roundId: room.round.id,
          playerId,
          points: bonus * multiplier,
          reason: `speed_bonus_${rank}`,
        },
      });
    }
  }

  const [corePlayers, subs] = await Promise.all([
    prisma.player.count({
      where: { roomId: room.id, isAudience: false, connected: true },
    }),
    prisma.submission.count({ where: { roundId: room.round.id, stage } }),
  ]);
  if (subs >= corePlayers) {
    // Multi-stage games advance through their stages; single-stage games go
    // straight to REVEAL.
    if (def.stages && stage < def.stages.length - 1) {
      await advanceSubmitStage(io, room);
    } else {
      await enterRevealPhase(io, room);
    }
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
  const def = getGame(room.round.gameId);
  if (def.flow !== "standard" && def.flow !== "chain" && def.flow !== "combo")
    throw new Error("This game doesn't use voting.");
  const voter = await prisma.player.findUnique({ where: { id: voterId } });
  if (!voter) throw new Error("Voter not found.");
  const weight = voter.isAudience ? DEFAULTS.AUDIENCE_VOTE_WEIGHT : 1;

  if (submissionId === "__truth__" && def.scoring === "fib") {
    await prisma.vote.upsert({
      where: { roundId_voterId: { roundId: room.round.id, voterId } },
      update: { submissionId: null, forTruth: true, weight },
      create: { roundId: room.round.id, voterId, submissionId: null, forTruth: true, weight },
    });
  } else {
    const sub = await prisma.submission.findUnique({ where: { id: submissionId } });
    if (!sub || sub.roundId !== room.round.id) throw new Error("Invalid submission.");
    // Self-votes are normally blocked; allow them in solo test rooms so you
    // can exercise take/chain/combo voting alone.
    if (sub.playerId === voterId) {
      const coreCount = await prisma.player.count({
        where: { roomId: room.id, isAudience: false, connected: true },
      });
      if (coreCount > 1) throw new Error("You can't vote for yourself.");
    }
    await prisma.vote.upsert({
      where: { roundId_voterId: { roundId: room.round.id, voterId } },
      update: { submissionId, forTruth: false, weight },
      create: { roundId: room.round.id, voterId, submissionId, forTruth: false, weight },
    });
  }

  const [eligible, cast] = await Promise.all([
    prisma.player.count({ where: { roomId: room.id, connected: true } }),
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
  patch: { familyMode?: boolean; streamerMode?: boolean; selectedGameId?: string }
) {
  if (!canControl(requesterPlayerId, room)) throw new Error("Only the host can change settings.");
  if (room.matchId) throw new Error("Can't change settings mid-match.");
  const data: { familyMode?: boolean; streamerMode?: boolean; selectedGameId?: string } = {};
  if (typeof patch.familyMode === "boolean") {
    data.familyMode = patch.familyMode;
    room.familyMode = patch.familyMode;
  }
  if (typeof patch.streamerMode === "boolean") {
    data.streamerMode = patch.streamerMode;
    room.streamerMode = patch.streamerMode;
  }
  if (typeof patch.selectedGameId === "string") {
    if (!GAMES[patch.selectedGameId]) throw new Error("Unknown game.");
    data.selectedGameId = patch.selectedGameId;
    room.selectedGameId = patch.selectedGameId;
    room.currentGameId = patch.selectedGameId;
  }
  if (Object.keys(data).length)
    await prisma.room.update({ where: { id: room.id }, data });
}

// Count current lobby votes and return the gameId with the most. Returns null
// if there are no votes at all. Ties are broken by the order games appear in
// the registry — stable across restarts.
function resolveVotedGame(room: LiveRoom): string | null {
  if (room.gameVotes.size === 0) return null;
  const tally = new Map<string, number>();
  for (const gid of room.gameVotes.values()) {
    if (!GAMES[gid]) continue;
    tally.set(gid, (tally.get(gid) ?? 0) + 1);
  }
  if (tally.size === 0) return null;
  let best: string | null = null;
  let bestCount = -1;
  for (const g of GAME_LIST) {
    const count = tally.get(g.id) ?? 0;
    if (count > bestCount) {
      bestCount = count;
      best = g.id;
    }
  }
  return best;
}

export async function playerVoteGame(
  io: IO,
  room: LiveRoom,
  voterId: string,
  gameId: string | null
) {
  if (room.phase !== "LOBBY" || room.matchId) {
    throw new Error("Game voting is only open in the lobby.");
  }
  const voter = await prisma.player.findUnique({ where: { id: voterId } });
  if (!voter) throw new Error("Voter not found.");
  if (voter.isAudience && !voter.isRemote) {
    throw new Error("Audience members don't vote on games.");
  }
  if (gameId === null) {
    room.gameVotes.delete(voterId);
  } else {
    if (!GAMES[gameId]) throw new Error("Unknown game.");
    const previous = room.gameVotes.get(voterId);
    if (previous === gameId) {
      // Tapping the same game again clears the vote (toggle behaviour).
      room.gameVotes.delete(voterId);
    } else {
      room.gameVotes.set(voterId, gameId);
    }
  }
  // Surface the current front-runner as the room's selectedGameId so the TV's
  // "up next" display + match-start fallback always reflect the live vote.
  const leader = resolveVotedGame(room);
  if (leader && leader !== room.selectedGameId) {
    room.selectedGameId = leader;
    await prisma.room.update({
      where: { id: room.id },
      data: { selectedGameId: leader },
    });
  }
  await broadcast(io, room);
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
