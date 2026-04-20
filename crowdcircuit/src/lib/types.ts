// Canonical client/server-shared types. The Socket.IO server emits the
// `room:state` event with a payload shaped exactly like `RoomSnapshot`.

export type Phase = "LOBBY" | "SUBMIT" | "REVEAL" | "VOTE" | "SCORE" | "MATCH_END";

export interface PublicPlayer {
  id: string;
  displayName: string;
  isAudience: boolean;
  connected: boolean;
  isHost: boolean;
  score: number;
}

export interface RevealItem {
  submissionId: string;
  authorId: string;
  authorName: string; // hidden until reveal phase has finished server-side
  text: string;
}

export interface RoomSnapshot {
  code: string;
  status: "LOBBY" | "IN_MATCH" | "ENDED";
  phase: Phase;
  hostPlayerId: string | null;
  familyMode: boolean;
  streamerMode: boolean;
  players: PublicPlayer[];
  audienceCount: number;
  round: {
    number: number;
    total: number;
    prompt: string | null;
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
    p: { familyMode?: boolean; streamerMode?: boolean },
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
