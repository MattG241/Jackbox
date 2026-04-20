"use client";

import { useState } from "react";
import { useRoomStore } from "@/stores/useRoomStore";
import { getSocket } from "@/lib/socketClient";
import { Countdown } from "./Countdown";
import type { ActionResult, GameCard, RoomSnapshot } from "@/lib/types";

const accentToClass: Record<GameCard["accent"], { chip: string; heading: string }> = {
  ember: { chip: "!bg-ember/20 !text-ember", heading: "text-ember" },
  neon: { chip: "!bg-neon/20 !text-neon", heading: "text-neon" },
  sol: { chip: "!bg-sol/20 !text-sol", heading: "text-sol" },
  orchid: { chip: "!bg-orchid/20 !text-orchid", heading: "text-orchid" },
};

function currentGame(snapshot: RoomSnapshot | null): GameCard | null {
  if (!snapshot) return null;
  const id = snapshot.round?.gameId ?? snapshot.currentGameId ?? snapshot.selectedGameId;
  return snapshot.games.find((g) => g.id === id) ?? null;
}

export function HostView() {
  const { snapshot, session } = useRoomStore();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!snapshot || !session) return <FullscreenLoader />;
  const hostMode = session.isHost;

  function act(event: "host:startMatch" | "host:nextPhase" | "host:endMatch") {
    setError(null);
    setBusy(true);
    const socket = getSocket();
    const cb = (res: ActionResult) => {
      setBusy(false);
      if (!res.ok) setError(res.reason);
    };
    if (event === "host:startMatch") socket.emit("host:startMatch", cb);
    else if (event === "host:nextPhase") socket.emit("host:nextPhase", cb);
    else socket.emit("host:endMatch", cb);
  }

  function updateSettings(patch: {
    familyMode?: boolean;
    streamerMode?: boolean;
    selectedGameId?: string;
  }) {
    getSocket().emit("host:updateSettings", patch, () => {});
  }

  const game = currentGame(snapshot);

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-8 px-6 py-8">
      <Header streamerLean={snapshot.streamerMode} />
      {snapshot.phase === "LOBBY" && (
        <LobbyPanel
          hostMode={hostMode}
          onStart={() => act("host:startMatch")}
          onUpdate={updateSettings}
          busy={busy}
          error={error}
        />
      )}
      {snapshot.phase === "SUBMIT" && <SubmitPanel game={game} />}
      {snapshot.phase === "REVEAL" && <RevealPanel game={game} />}
      {snapshot.phase === "VOTE" && <VotePanel game={game} />}
      {snapshot.phase === "SCORE" && <ScorePanel />}
      {snapshot.phase === "MATCH_END" && <MatchEndPanel />}
      <HostControls
        hostMode={hostMode}
        onNext={() => act("host:nextPhase")}
        onEnd={() => act("host:endMatch")}
        busy={busy}
      />
    </main>
  );
}

function Header({ streamerLean }: { streamerLean: boolean }) {
  const { snapshot } = useRoomStore();
  if (!snapshot) return null;
  const game = currentGame(snapshot);
  return (
    <header className="flex flex-col items-center gap-2 text-center">
      {!streamerLean && (
        <div className="cc-chip">
          <span>CrowdCircuit{game ? ` • ${game.name}` : ""}</span>
        </div>
      )}
      <div className="text-sm uppercase tracking-[0.35em] text-mist/60">Room code</div>
      <div className="cc-code">{snapshot.code}</div>
      <div className="text-sm text-mist/60">
        {snapshot.players.length} player{snapshot.players.length === 1 ? "" : "s"} •{" "}
        {snapshot.audienceCount} in audience
      </div>
    </header>
  );
}

function LobbyPanel({
  hostMode,
  onStart,
  onUpdate,
  busy,
  error,
}: {
  hostMode: boolean;
  onStart: () => void;
  onUpdate: (patch: {
    familyMode?: boolean;
    streamerMode?: boolean;
    selectedGameId?: string;
  }) => void;
  busy: boolean;
  error: string | null;
}) {
  const { snapshot } = useRoomStore();
  if (!snapshot) return null;
  return (
    <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <GamePicker
        games={snapshot.games}
        selectedId={snapshot.selectedGameId}
        hostMode={hostMode}
        onPick={(id) => onUpdate({ selectedGameId: id })}
      />
      <div className="space-y-6">
        <div className="cc-card p-6">
          <h2 className="text-lg font-semibold">Players in the room</h2>
          <ul className="mt-3 grid grid-cols-2 gap-2">
            {snapshot.players.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-xl bg-white/5 p-2.5 text-sm"
              >
                <span className="truncate font-medium">
                  {p.displayName}
                  {p.isHost && <span className="ml-2 text-xs text-neon">HOST</span>}
                </span>
                <span
                  className={`h-2 w-2 rounded-full ${p.connected ? "bg-neon" : "bg-white/30"}`}
                  title={p.connected ? "Connected" : "Disconnected"}
                />
              </li>
            ))}
            {snapshot.players.length === 0 && (
              <li className="col-span-full text-sm text-mist/60">
                Share the room code — players can join from their phone.
              </li>
            )}
          </ul>
          <div className="mt-3 text-xs text-mist/60">
            {snapshot.audienceCount > 0 && `${snapshot.audienceCount} in audience.`}
          </div>
        </div>
        <div className="cc-card p-6">
          <h3 className="text-lg font-semibold">Ready up</h3>
          <p className="mt-1 text-sm text-mist/70">
            Need at least 3 players. Max 10. Unlimited audience.
          </p>
          {hostMode ? (
            <>
              <div className="mt-4 space-y-2">
                <Toggle
                  label="Family mode"
                  description="Softer prompts and gentler criteria."
                  checked={snapshot.familyMode}
                  onChange={(v) => onUpdate({ familyMode: v })}
                />
                <Toggle
                  label="Streamer mode"
                  description="Cleaner host display for overlays."
                  checked={snapshot.streamerMode}
                  onChange={(v) => onUpdate({ streamerMode: v })}
                />
              </div>
              {error && (
                <div role="alert" className="mt-3 text-sm text-ember">
                  {error}
                </div>
              )}
              <button
                onClick={onStart}
                disabled={busy}
                className="cc-btn-primary mt-6 w-full"
              >
                {busy ? "Starting…" : "Start match"}
              </button>
            </>
          ) : (
            <p className="mt-4 text-sm text-mist/70">
              Waiting on the host to start the match.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function GamePicker({
  games,
  selectedId,
  hostMode,
  onPick,
}: {
  games: GameCard[];
  selectedId: string;
  hostMode: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <div className="cc-card p-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Pick a game</h2>
        <span className="text-xs text-mist/60">{games.length} available</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {games.map((g) => {
          const active = g.id === selectedId;
          const accent = accentToClass[g.accent];
          return (
            <button
              key={g.id}
              type="button"
              disabled={!hostMode}
              onClick={() => hostMode && onPick(g.id)}
              className={`rounded-2xl border p-4 text-left transition ${
                active
                  ? "border-ember bg-ember/10 shadow-[0_0_24px_rgba(255,79,123,0.25)]"
                  : "border-white/10 bg-white/[0.03] hover:border-white/30 disabled:cursor-default"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className={`text-base font-semibold ${accent.heading}`}>{g.name}</div>
                {active && <span className="cc-chip !bg-ember/20 !text-ember">Selected</span>}
              </div>
              <div className="mt-1 text-sm italic text-mist/70">{g.tagline}</div>
              <div className="mt-2 text-xs text-mist/60 line-clamp-3">{g.description}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SubmitPanel({ game }: { game: GameCard | null }) {
  const { snapshot } = useRoomStore();
  if (!snapshot?.round) return null;
  const r = snapshot.round;
  const accent = game ? accentToClass[game.accent] : null;
  return (
    <section className="cc-card mx-auto w-full max-w-4xl p-10 text-center">
      <div className="flex items-center justify-center gap-3 text-sm text-mist/60">
        <span>{game?.name}</span>
        <span>•</span>
        <span>
          Round {r.number} of {r.total}
        </span>
        <Countdown endsAt={r.phaseEndsAt} />
      </div>
      <h2 className={`mt-4 text-3xl font-semibold sm:text-5xl ${accent?.heading ?? ""}`}>
        {r.prompt}
      </h2>
      <p className="mt-4 text-mist/60">
        {game?.scoring === "fib"
          ? "Write a fake answer that sounds true. The real one is in here too."
          : r.criterionHidden
          ? "Take out your phones. The criterion drops at voting time."
          : `Write the ${game?.name.toLowerCase()}.`}
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        {snapshot.players.map((p) => (
          <span
            key={p.id}
            className={`cc-chip ${r.submittedPlayerIds.includes(p.id) ? "!bg-neon/20 !text-neon" : ""}`}
          >
            {p.displayName}
            {r.submittedPlayerIds.includes(p.id) ? " ✓" : " …"}
          </span>
        ))}
      </div>
    </section>
  );
}

function RevealPanel({ game }: { game: GameCard | null }) {
  const { snapshot } = useRoomStore();
  if (!snapshot?.round) return null;
  const r = snapshot.round;
  return (
    <section className="cc-card mx-auto w-full max-w-5xl p-10">
      <div className="text-center text-sm text-mist/60">
        {game?.name} • Round {r.number}
      </div>
      <h2 className="mt-2 text-center text-2xl font-semibold sm:text-4xl">{r.prompt}</h2>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {r.reveal.map((item, i) => (
          <div
            key={item.submissionId ?? `truth-${i}`}
            className="cc-card border-white/10 p-5 animate-floaty"
            style={{ animationDelay: `${i * 150}ms` }}
          >
            <div className="text-xs text-mist/50">Take {i + 1}</div>
            <div className="mt-1 text-lg">{item.text}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function VotePanel({ game }: { game: GameCard | null }) {
  const { snapshot } = useRoomStore();
  if (!snapshot?.round) return null;
  const r = snapshot.round;
  const isFib = game?.scoring === "fib";
  return (
    <section className="cc-card mx-auto w-full max-w-5xl p-10">
      <div className="flex items-center justify-between text-sm text-mist/60">
        <span>
          {game?.name} • Round {r.number} • Voting
        </span>
        <Countdown endsAt={r.phaseEndsAt} />
      </div>
      <h2 className="mt-2 text-3xl font-semibold sm:text-4xl">{r.prompt}</h2>
      {isFib ? (
        <div className="mt-2 cc-chip !bg-orchid/20 !text-orchid">
          Pick the real answer. Fakes are in here.
        </div>
      ) : r.criterionLabel ? (
        <div className="mt-2 cc-chip !bg-sol/20 !text-sol">
          Vote for the {r.criterionLabel}
        </div>
      ) : null}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {r.reveal.map((item, i) => (
          <div key={item.submissionId ?? `truth-${i}`} className="rounded-2xl bg-white/5 p-5">
            <div className="text-xs text-mist/50">Take {i + 1}</div>
            <div className="mt-1 text-lg">{item.text}</div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm text-mist/60">
        {r.votedVoterIds.length} vote{r.votedVoterIds.length === 1 ? "" : "s"} cast.
      </p>
    </section>
  );
}

function ScorePanel() {
  const { snapshot } = useRoomStore();
  if (!snapshot?.round) return null;
  const summary = snapshot.round.roundSummary ?? [];
  const leaderboard = [...snapshot.players].sort((a, b) => b.score - a.score);
  const truthItem = snapshot.round.reveal.find((r) => r.isTruth);
  return (
    <section className="mx-auto grid w-full max-w-5xl gap-6 md:grid-cols-2">
      <div className="cc-card p-6">
        <h3 className="text-lg font-semibold">This round</h3>
        {truthItem && (
          <div className="mt-3 rounded-xl bg-neon/10 p-3 text-sm">
            <span className="text-xs uppercase tracking-widest text-neon">Truth</span>
            <div className="mt-1">{truthItem.text}</div>
          </div>
        )}
        <ul className="mt-3 space-y-2">
          {summary.length === 0 && <li className="text-mist/60">No points scored.</li>}
          {summary.map((s) => (
            <li
              key={s.playerId}
              className="flex items-center justify-between rounded-lg bg-white/5 p-3"
            >
              <span className="font-medium">{s.name}</span>
              <span className="font-mono text-neon">+{s.delta}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="cc-card p-6">
        <h3 className="text-lg font-semibold">Leaderboard</h3>
        <ul className="mt-3 space-y-2">
          {leaderboard.map((p, i) => (
            <li
              key={p.id}
              className={`flex items-center justify-between rounded-lg p-3 ${
                i === 0 ? "bg-ember/20" : "bg-white/5"
              }`}
            >
              <span className="flex items-center gap-3">
                <span className="w-6 text-center text-sm text-mist/50">{i + 1}</span>
                <span className="font-medium">{p.displayName}</span>
              </span>
              <span className="font-mono">{p.score}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function MatchEndPanel() {
  const { snapshot } = useRoomStore();
  if (!snapshot) return null;
  const leaderboard = [...snapshot.players].sort((a, b) => b.score - a.score);
  const champ = leaderboard[0];
  return (
    <section className="cc-card mx-auto w-full max-w-3xl p-10 text-center">
      <div className="text-sm uppercase tracking-[0.35em] text-mist/60">Match complete</div>
      <h2 className="mt-2 text-4xl font-semibold">
        {champ ? `${champ.displayName} takes the crown` : "It's a wrap"}
      </h2>
      <ul className="mx-auto mt-6 max-w-md space-y-2">
        {leaderboard.map((p, i) => (
          <li
            key={p.id}
            className="flex items-center justify-between rounded-lg bg-white/5 p-3"
          >
            <span>
              {i + 1}. {p.displayName}
            </span>
            <span className="font-mono">{p.score}</span>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm text-mist/60">Heading back to the lobby in a moment.</p>
    </section>
  );
}

function HostControls({
  hostMode,
  onNext,
  onEnd,
  busy,
}: {
  hostMode: boolean;
  onNext: () => void;
  onEnd: () => void;
  busy: boolean;
}) {
  const { snapshot } = useRoomStore();
  if (!hostMode || !snapshot) return null;
  if (snapshot.phase === "LOBBY") return null;
  return (
    <div className="mt-auto flex flex-wrap justify-center gap-3 border-t border-white/5 pt-4">
      <button onClick={onNext} disabled={busy} className="cc-btn-ghost">
        Advance phase
      </button>
      <button onClick={onEnd} disabled={busy} className="cc-btn-ghost">
        End match
      </button>
    </div>
  );
}

function Toggle({
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
        className="mt-1 h-4 w-4"
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

function FullscreenLoader() {
  return (
    <main className="grid min-h-screen place-items-center">
      <div className="cc-chip">
        <span className="h-1.5 w-1.5 animate-pulseSoft rounded-full bg-neon" />
        Tuning the crowd…
      </div>
    </main>
  );
}
