// Canonical client/server-shared types. The Socket.IO server emits the
// `room:state` event with a payload shaped exactly like `RoomSnapshot`.

export type Phase = "LOBBY" | "SUBMIT" | "REVEAL" | "VOTE" | "SCORE" | "MATCH_END";

export interface PublicPlayer {
  id: string;
  displayName: string;
  isAudience: boolean;
  connected: boolean;
  isHost: boolean;
  avatarColor: string;
  avatarEmoji: string;
  score: number;
}

export interface MatchHighlight {
  id: string;
  title: string;
  playerId: string | null;
  playerName: string;
  avatarColor: string;
  avatarEmoji: string;
  detail: string;
}

export interface RevealItem {
  // For player submissions: submissionId + authorId set, isTruth false.
  // For fib games' hidden truth: submissionId null, authorId null, isTruth true.
  submissionId: string | null;
  authorId: string | null;
  authorName: string | null; // only populated during SCORE phase
  text: string;
  isTruth: boolean;
}

export type GameFlow = "standard" | "quiz" | "reaction";
export type GameSubmissionKind = "TEXT" | "DRAWING" | "QUIZ" | "TAP" | "PERCENT";
export type GameScoring = "take" | "fib" | "quiz" | "reaction" | "percent" | "herd";

export interface GameCard {
  id: string;
  name: string;
  tagline: string;
  description: string;
  scoring: GameScoring;
  flow: GameFlow;
  submissionKind: GameSubmissionKind;
  usesCriterion: boolean;
  accent: "ember" | "neon" | "sol" | "orchid";
}

export interface RoomSnapshot {
  code: string;
  status: "LOBBY" | "IN_MATCH" | "ENDED";
  phase: Phase;
  hostPlayerId: string | null;
  familyMode: boolean;
  streamerMode: boolean;
  selectedGameId: string;
  currentGameId: string; // game the current round (or last round) was played with
  players: PublicPlayer[];
  audienceCount: number;
  games: GameCard[];
  // Populated on MATCH_END — MVP/awards based on the finished match.
  highlights: MatchHighlight[];
  round: {
    number: number;
    total: number;
    gameId: string;
    flow: GameFlow;
    submissionKind: GameSubmissionKind;
    prompt: string | null;
    // Optional hint / setup text shown alongside the prompt.
    promptDetail: string | null;
    // For QUIZ flow: multiple-choice options (plain strings).
    choices: string[] | null;
    // For QUIZ flow during SCORE: the correct choice. Null in earlier phases.
    truth: string | null;
    criterionLabel: string | null;
    // criterion is hidden during SUBMIT (secret criterion) and revealed at VOTE.
    criterionHidden: boolean;
    phaseEndsAt: number | null; // epoch ms
    submittedPlayerIds: string[];
    reveal: RevealItem[]; // populated during REVEAL/VOTE/SCORE
    votedVoterIds: string[];
    roundSummary: { playerId: string; name: string; delta: number }[] | null;
  } | null;
}

export interface SessionHandshake {
  sessionToken: string;
  playerId: string;
  displayName: string;
  isAudience: boolean;
  isHost: boolean;
  roomCode: string;
}

// Socket.IO event map — strongly typed in both client and server.
export interface ClientToServerEvents {
  "auth:resume": (p: { sessionToken: string }, cb: (res: AuthResult) => void) => void;
  "host:startMatch": (cb: (res: ActionResult) => void) => void;
  "host:nextPhase": (cb: (res: ActionResult) => void) => void;
  "host:updateSettings": (
    p: { familyMode?: boolean; streamerMode?: boolean; selectedGameId?: string },
    cb: (res: ActionResult) => void
  ) => void;
  "host:endMatch": (cb: (res: ActionResult) => void) => void;
  "player:submit": (p: { text: string }, cb: (res: ActionResult) => void) => void;
  "player:vote": (p: { submissionId: string }, cb: (res: ActionResult) => void) => void;
  "player:report": (
    p: { content: string; reason?: string },
    cb: (res: ActionResult) => void
  ) => void;
}

export interface ServerToClientEvents {
  "room:state": (snapshot: RoomSnapshot) => void;
  "room:toast": (msg: { tone: "info" | "warn" | "error"; text: string }) => void;
}

export type AuthResult =
  | { ok: true; session: SessionHandshake }
  | { ok: false; reason: string };

export type ActionResult = { ok: true } | { ok: false; reason: string };
