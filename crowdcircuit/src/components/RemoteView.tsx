"use client";

import { useState } from "react";
import { useRoomStore } from "@/stores/useRoomStore";
import { getSocket } from "@/lib/socketClient";
import type { ActionResult, GameCard, Phase, RoomSnapshot } from "@/lib/types";
import { Countdown } from "./Countdown";
import { PlayerAvatar } from "./Avatar";

const PHASE_LABELS: Record<Phase, string> = {
  LOBBY: "Lobby",
  SUBMIT: "Submit",
  REVEAL: "Reveal",
  VOTE: "Vote",
  SCORE: "Score",
  MATCH_END: "Match end",
};

const PHASE_NEXT: Partial<Record<Phase, string>> = {
  SUBMIT: "Skip to reveal",
  REVEAL: "Start voting",
  VOTE: "End voting",
  SCORE: "Next round",
};

function currentGame(snapshot: RoomSnapshot | null): GameCard | null {
  if (!snapshot) return null;
  const id = snapshot.round?.gameId ?? snapshot.currentGameId ?? snapshot.selectedGameId;
  return snapshot.games.find((g) => g.id === id) ?? null;
}

/**
 * RemoteView — the phone-as-host-controller UI. Big thumb targets, one
 * primary action per phase, no gameplay interactions (those live in
 * PlayerView for actual players).
 */
export function RemoteView() {
  const { snapshot, session, connected } = useRoomStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);

  if (!snapshot || !session) return <Loader />;

  function act(
    event: "host:startMatch" | "host:nextPhase" | "host:endMatch"
  ) {
    setError(null);
    setBusy(true);
    const cb = (res: ActionResult) => {
      setBusy(false);
      if (!res.ok) setError(res.reason);
    };
    const socket = getSocket();
    if (event === "host:startMatch") socket.emit("host:startMatch", cb);
    else if (event === "host:nextPhase") socket.emit("host:nextPhase", cb);
    else socket.emit("host:endMatch", cb);
  }

  function updateSettings(patch: {
    familyMode?: boolean;
    streamerMode?: boolean;
    selectedGameId?: string;
  }) {
    getSocket().emit("host:updateSettings", patch, (res) => {
      if (!res.ok) setError(res.reason);
    });
  }

  const game = currentGame(snapshot);
  const phase = snapshot.phase;
  const nextLabel = PHASE_NEXT[phase] ?? "Advance";
  const r = snapshot.round;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-4 py-5">
      <TopBar code={snapshot.code} phase={phase} connected={connected} />

      {phase === "LOBBY" && (
        <LobbyRemote
          snapshot={snapshot}
          busy={busy}
          onStart={() => act("host:startMatch")}
          onUpdate={updateSettings}
        />
      )}

      {phase !== "LOBBY" && phase !== "MATCH_END" && r && (
        <>
          <MatchStatus
            snapshot={snapshot}
            phaseLabel={PHASE_LABELS[phase]}
            gameName={game?.name ?? ""}
          />
          <BigAdvance
            label={nextLabel}
            busy={busy}
            onPress={() => act("host:nextPhase")}
            endsAt={r.phaseEndsAt}
          />
          <PlayerStatus snapshot={snapshot} />
        </>
      )}

      {phase === "MATCH_END" && (
        <div className="cc-card p-5 text-center">
          <div className="text-sm uppercase tracking-widest text-mist/60">
            Match complete
          </div>
          <p className="mt-2 text-mist/70">
            Auto-returning to lobby in a moment. Pick the next game from the TV.
          </p>
        </div>
      )}

      {error && (
        <div role="alert" className="cc-card border border-ember/40 bg-ember/10 p-3 text-sm text-ember">
          {error}
        </div>
      )}

      {phase !== "LOBBY" && phase !== "MATCH_END" && (
        <div className="mt-auto pt-4">
          {!confirmEnd ? (
            <button
              type="button"
              onClick={() => setConfirmEnd(true)}
              className="cc-btn-ghost w-full"
            >
              End match
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmEnd(false)}
                className="cc-btn-ghost flex-1"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmEnd(false);
                  act("host:endMatch");
                }}
                className="cc-btn-primary flex-1"
              >
                End now
              </button>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

function TopBar({
  code,
  phase,
  connected,
}: {
  code: string;
  phase: Phase;
  connected: boolean;
}) {
  return (
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-ember shadow-[0_0_16px_rgba(255,79,123,0.5)]">
          <span className="font-display text-base font-bold">C</span>
        </div>
        <div className="flex flex-col">
          <span className="font-display text-base font-semibold">Remote</span>
          <span className="font-mono text-xs text-mist/60">Room {code}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`h-2 w-2 rounded-full ${
            connected ? "bg-neon animate-pulseSoft" : "bg-ember"
          }`}
          title={connected ? "Connected" : "Reconnecting…"}
        />
        <span className="cc-chip">{PHASE_LABELS[phase]}</span>
      </div>
    </header>
  );
}

function LobbyRemote({
  snapshot,
  busy,
  onStart,
  onUpdate,
}: {
  snapshot: RoomSnapshot;
  busy: boolean;
  onStart: () => void;
  onUpdate: (patch: {
    familyMode?: boolean;
    streamerMode?: boolean;
    selectedGameId?: string;
  }) => void;
}) {
  const playerCount = snapshot.players.length;
  const totalVotes = Object.values(snapshot.gameVotes).reduce((a, b) => a + b, 0);

  // Game selection is driven by player votes — pick the highest-voted game,
  // falling back to the room's currently-selected game if nobody has voted
  // yet. The TV and phones all show the same leader.
  const leaderId = (() => {
    let best = snapshot.selectedGameId;
    let bestCount = -1;
    for (const g of snapshot.games) {
      const count = snapshot.gameVotes[g.id] ?? 0;
      if (count > bestCount) {
        bestCount = count;
        best = g.id;
      }
    }
    return bestCount > 0 ? best : snapshot.selectedGameId;
  })();
  const leader = snapshot.games.find((g) => g.id === leaderId) ?? null;

  return (
    <>
      <div className="cc-card p-4">
        <div className="text-xs uppercase tracking-widest text-mist/60">Room</div>
        <div className="mt-1 text-2xl font-semibold">
          {playerCount} player{playerCount === 1 ? "" : "s"}
          {snapshot.audienceCount > 0 && (
            <span className="ml-2 text-sm text-mist/60">
              • {snapshot.audienceCount} audience
            </span>
          )}
        </div>
        <div className="mt-3 rounded-xl bg-white/5 p-3">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-widest text-mist/60">
              {totalVotes === 0 ? "Next up" : "Leading vote"}
            </div>
            <span className="cc-chip">
              {totalVotes} vote{totalVotes === 1 ? "" : "s"}
            </span>
          </div>
          <div className="mt-1 font-semibold">{leader?.name ?? "—"}</div>
          {leader && (
            <div className="text-xs italic text-mist/70">{leader.tagline}</div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onStart}
        disabled={busy || playerCount === 0}
        className="cc-btn-primary w-full py-5 text-lg"
      >
        {busy
          ? "Starting…"
          : playerCount === 0
          ? "Waiting for players…"
          : leader
          ? `Start ${leader.name}`
          : "Start match"}
      </button>

      <div className="cc-card p-4">
        <div className="text-xs uppercase tracking-widest text-mist/60">Live votes</div>
        <ul className="mt-2 grid gap-1.5 text-sm">
          {snapshot.games
            .map((g) => ({ g, count: snapshot.gameVotes[g.id] ?? 0 }))
            .filter(({ count }) => count > 0)
            .sort((a, b) => b.count - a.count)
            .map(({ g, count }) => (
              <li
                key={g.id}
                className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                  g.id === leaderId ? "bg-ember/15 text-mist" : "bg-white/5"
                }`}
              >
                <span className="truncate">{g.name}</span>
                <span className="font-mono tabular-nums">{count}</span>
              </li>
            ))}
          {totalVotes === 0 && (
            <li className="text-xs text-mist/60">
              Nobody has voted yet. Players pick from their phones.
            </li>
          )}
        </ul>
      </div>

      <div className="cc-card p-4">
        <div className="text-xs uppercase tracking-widest text-mist/60">
          Room settings
        </div>
        <div className="mt-2 flex flex-col gap-2">
          <RemoteToggle
            label="Family mode"
            description="Softer prompts and gentler criteria."
            checked={snapshot.familyMode}
            onChange={(v) => onUpdate({ familyMode: v })}
          />
          <RemoteToggle
            label="Streamer mode"
            description="Cleaner TV display for overlays."
            checked={snapshot.streamerMode}
            onChange={(v) => onUpdate({ streamerMode: v })}
          />
        </div>
      </div>
    </>
  );
}

function MatchStatus({
  snapshot,
  phaseLabel,
  gameName,
}: {
  snapshot: RoomSnapshot;
  phaseLabel: string;
  gameName: string;
}) {
  const r = snapshot.round;
  if (!r) return null;
  return (
    <div className="cc-card p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-widest text-mist/60">
          {gameName}
        </div>
        <div className="text-xs font-mono text-mist/60">
          Round {r.number}/{r.total}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <div className="text-2xl font-semibold">{phaseLabel}</div>
        <Countdown endsAt={r.phaseEndsAt} />
      </div>
      {r.prompt && (
        <p className="mt-2 line-clamp-3 text-sm text-mist/70">{r.prompt}</p>
      )}
    </div>
  );
}

function BigAdvance({
  label,
  busy,
  onPress,
  endsAt,
}: {
  label: string;
  busy: boolean;
  onPress: () => void;
  endsAt: number | null;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={busy}
      className="cc-btn-primary flex w-full flex-col items-center justify-center gap-1 py-7 text-lg"
    >
      <span className="text-xl">{busy ? "Working…" : label}</span>
      {endsAt != null && (
        <span className="text-xs font-mono opacity-80">
          auto-advances in <Countdown endsAt={endsAt} />
        </span>
      )}
    </button>
  );
}

function PlayerStatus({ snapshot }: { snapshot: RoomSnapshot }) {
  const r = snapshot.round;
  if (!r) return null;
  const submitted = new Set(r.submittedPlayerIds);
  const voted = new Set(r.votedVoterIds);
  const showVoted = snapshot.phase === "VOTE";
  return (
    <div className="cc-card p-4">
      <div className="text-xs uppercase tracking-widest text-mist/60">
        Players ({snapshot.players.length})
      </div>
      <ul className="mt-2 grid gap-1.5">
        {snapshot.players.map((p) => {
          const done = showVoted ? voted.has(p.id) : submitted.has(p.id);
          return (
            <li
              key={p.id}
              className={`flex items-center justify-between rounded-lg p-2 text-sm ${
                done ? "bg-neon/10" : "bg-white/5"
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <PlayerAvatar player={p} size="sm" />
                <span className="truncate">{p.displayName}</span>
              </span>
              <span className={done ? "text-neon" : "text-mist/50"}>
                {done ? "✓" : "…"}
              </span>
            </li>
          );
        })}
        {snapshot.players.length === 0 && (
          <li className="text-sm text-mist/60">No players yet.</li>
        )}
      </ul>
    </div>
  );
}

function RemoteToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-white/5 p-3">
      <input
        type="checkbox"
        className="mt-1 h-5 w-5"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="flex flex-col">
        <span className="font-medium">{label}</span>
        <span className="text-xs text-mist/60">{description}</span>
      </span>
    </label>
  );
}

function Loader() {
  return (
    <main className="grid min-h-screen place-items-center">
      <div className="cc-chip">
        <span className="h-1.5 w-1.5 animate-pulseSoft rounded-full bg-neon" />
        Pairing remote…
      </div>
    </main>
  );
}
