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

// Per-stage target sent to each player in multi-stage games. The server builds
// this as a map keyed by playerId; the client filters to its own entry.
export interface PlayerStageTarget {
  // What to submit this stage.
  kind: GameSubmissionKind;
  // For DRAWING stages the text is the prompt to draw; for TEXT stages
  // it's either a previous drawing (stringified) to caption, or a phrase
  // to continue from.
  prompt: string | null;
  // For chain games: the kind of the target content being shown (if any).
  inputKind: GameSubmissionKind | null;
  // For chain games: the content the player is responding to (e.g. the
  // drawing they need to caption). Null if there's nothing to display.
  inputText: string | null;
  fromPlayerName: string | null;
}

// Animated chain reveal for Stroke of Genius. Each chain is one origin
// player's seed phrase, followed by a drawing, followed by a guess, etc.
export interface ChainRevealEntry {
  kind: GameSubmissionKind;
  text: string;
  playerName: string;
  avatarColor: string;
  avatarEmoji: string;
}
export interface ChainReveal {
  originPlayerName: string;
  entries: ChainRevealEntry[];
}

// Mash-Up Doodle: icon author's submission paired with another player's
// slogan. The `id` is the icon submission id (used as the vote target).
export interface MashupReveal {
  id: string;
  iconText: string;
  iconAuthorId: string;
  iconAuthorName: string;
  sloganText: string;
  sloganAuthorId: string;
  sloganAuthorName: string;
}

// standard : SUBMIT -> REVEAL -> VOTE -> SCORE
// quiz     : SUBMIT -> REVEAL -> SCORE (no voting, truth-based scoring)
// reaction : SUBMIT -> SCORE (real-time)
// chain    : multi-stage SUBMIT* -> REVEAL -> VOTE -> SCORE (telephone)
// combo    : multi-stage SUBMIT* -> REVEAL -> VOTE -> SCORE (mash-up pairings)
export type GameFlow = "standard" | "quiz" | "reaction" | "chain" | "combo";
export type GameSubmissionKind =
  | "TEXT"
  | "DRAWING"
  | "QUIZ"
  | "TAP"
  | "PERCENT"
  | "TRACE"
  | "COLOR";
export type GameScoring =
  | "take"
  | "fib"
  | "quiz"
  | "reaction"
  | "percent"
  | "herd"
  | "trace"
  | "color"
  | "chain"
  | "combo";

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
  // Lobby voting: how many votes each game has right now, plus per-player
  // picks so clients can render "you voted for X" without extra roundtrips.
  gameVotes: Record<string, number>;
  playerGameVotes: Record<string, string>;
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
    // Multi-stage games: 0-indexed current stage + total stages.
    stage: number;
    totalStages: number;
    // Per-player target for the current SUBMIT stage (chain/combo games).
    // Keyed by playerId so clients self-select.
    playerTargets: Record<string, PlayerStageTarget> | null;
    // Stroke of Genius reveal payload.
    chains: ChainReveal[] | null;
    // Mash-Up Doodle reveal payload.
    mashups: MashupReveal[] | null;
  } | null;
}

export interface SessionHandshake {
  sessionToken: string;
  playerId: string;
  displayName: string;
  isAudience: boolean;
  isHost: boolean;
  // True for phone-as-remote controller sessions. Remotes are authorized
  // for host commands even though they aren't the TV host.
  isRemote: boolean;
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
  // Lobby-only: players cast a vote for which game to play next. Calling with
  // the same gameId again clears the vote (toggle). Ignored once the match
  // has started.
  "player:voteGame": (
    p: { gameId: string | null },
    cb: (res: ActionResult) => void
  ) => void;
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
