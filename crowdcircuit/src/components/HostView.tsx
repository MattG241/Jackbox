"use client";

import { useState } from "react";
import { useRoomStore } from "@/stores/useRoomStore";
import { getSocket } from "@/lib/socketClient";
import { Countdown } from "./Countdown";
import type { ActionResult } from "@/lib/types";

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

  function toggleSetting(patch: { familyMode?: boolean; streamerMode?: boolean }) {
    getSocket().emit("host:updateSettings", patch, () => {});
  }

  const streamerLean = snapshot.streamerMode;

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-8 px-6 py-8">
      <Header streamerLean={streamerLean} />
      {snapshot.phase === "LOBBY" && (
        <LobbyPanel
          hostMode={hostMode}
          onStart={() => act("host:startMatch")}
          onFamily={(v) => toggleSetting({ familyMode: v })}
          onStreamer={(v) => toggleSetting({ streamerMode: v })}
          busy={busy}
          error={error}
        />
      )}
      {snapshot.phase === "SUBMIT" && <SubmitPanel />}
      {snapshot.phase === "REVEAL" && <RevealPanel />}
      {snapshot.phase === "VOTE" && <VotePanel />}
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
  return (
    <header className="flex flex-col items-center gap-2 text-center">
      {!streamerLean && (
        <div className="cc-chip">
          <span>CrowdCircuit • Hot Take Hustle</span>
        </div>
      )}
      <div className="flex items-center gap-3">
        <div className="text-sm uppercase tracking-[0.35em] text-mist/60">Room code</div>
      </div>
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
  onFamily,
  onStreamer,
  busy,
  error,
}: {
  hostMode: boolean;
  onStart: () => void;
  onFamily: (v: boolean) => void;
  onStreamer: (v: boolean) => void;
  busy: boolean;
  error: string | null;
}) {
  const { snapshot } = useRoomStore();
  if (!snapshot) return null;
  return (
    <section className="grid gap-6 md:grid-cols-[2fr_1fr]">
      <div className="cc-card p-6">
        <h2 className="text-xl font-semibold">Players in the room</h2>
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {snapshot.players.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-xl bg-white/5 p-3"
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
              Share the room code — players can join at /play from their phone.
            </li>
          )}
        </ul>
      </div>
      <div className="cc-card p-6">
        <h3 className="text-lg font-semibold">Ready up</h3>
        <p className="mt-1 text-sm text-mist/70">
          Need at least 3 players. Max 10 per room. Unlimited audience.
        </p>
        {hostMode && (
          <>
            <div className="mt-4 space-y-2">
              <Toggle
                label="Family mode"
                description="Softer prompts, gentler criteria."
                checked={snapshot.familyMode}
                onChange={onFamily}
              />
              <Toggle
                label="Streamer mode"
                description="Cleaner host display for overlays."
                checked={snapshot.streamerMode}
                onChange={onStreamer}
              />
            </div>
            {error && (
              <div role="alert" className="mt-3 text-sm text-ember">
                {error}
              </div>
            )}
            <button onClick={onStart} disabled={busy} className="cc-btn-primary mt-6 w-full">
              {busy ? "Starting…" : "Start match"}
            </button>
          </>
        )}
        {!hostMode && (
          <p className="mt-4 text-sm text-mist/70">
            Waiting on the host to start the match.
          </p>
        )}
      </div>
    </section>
  );
}

function SubmitPanel() {
  const { snapshot } = useRoomStore();
  if (!snapshot?.round) return null;
  const r = snapshot.round;
  return (
    <section className="cc-card mx-auto w-full max-w-4xl p-10 text-center">
      <div className="flex items-center justify-center gap-3 text-sm text-mist/60">
        <span>Round {r.number} of {r.total}</span>
        <Countdown endsAt={r.phaseEndsAt} />
      </div>
      <h2 className="mt-4 text-3xl font-semibold sm:text-5xl">{r.prompt}</h2>
      <p className="mt-4 text-mist/60">Take out your phones. Drop a take. The criterion is a secret.</p>
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

function RevealPanel() {
  const { snapshot } = useRoomStore();
  if (!snapshot?.round) return null;
  const r = snapshot.round;
  return (
    <section className="cc-card mx-auto w-full max-w-5xl p-10">
      <div className="text-center text-sm text-mist/60">Round {r.number} • Reveal</div>
      <h2 className="mt-2 text-center text-2xl font-semibold sm:text-4xl">{r.prompt}</h2>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {r.reveal.map((item, i) => (
          <div
            key={item.submissionId}
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

function VotePanel() {
  const { snapshot } = useRoomStore();
  if (!snapshot?.round) return null;
  const r = snapshot.round;
  return (
    <section className="cc-card mx-auto w-full max-w-5xl p-10">
      <div className="flex items-center justify-between text-sm text-mist/60">
        <span>Round {r.number} • Voting</span>
        <Countdown endsAt={r.phaseEndsAt} />
      </div>
      <h2 className="mt-2 text-3xl font-semibold sm:text-4xl">{r.prompt}</h2>
      <div className="mt-2 cc-chip !bg-sol/20 !text-sol">
        Secret criterion: {r.criterionLabel}
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {r.reveal.map((item, i) => (
          <div key={item.submissionId} className="rounded-2xl bg-white/5 p-5">
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
  return (
    <section className="mx-auto grid w-full max-w-5xl gap-6 md:grid-cols-2">
      <div className="cc-card p-6">
        <h3 className="text-lg font-semibold">This round</h3>
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
