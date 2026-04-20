"use client";

import { useMemo, useState } from "react";
import { useRoomStore } from "@/stores/useRoomStore";
import { getSocket } from "@/lib/socketClient";
import { Countdown } from "./Countdown";

export function PlayerView() {
  const { snapshot, session } = useRoomStore();
  if (!snapshot || !session) return <Loader />;
  const me = snapshot.players.find((p) => p.id === session.playerId);
  const audience = session.isAudience;

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col gap-4 px-4 py-6">
      <Header audience={audience} displayName={session.displayName} code={snapshot.code} />
      {snapshot.phase === "LOBBY" && <LobbyCard audience={audience} />}
      {snapshot.phase === "SUBMIT" && !audience && (
        <SubmitCard submitted={!!me && !!snapshot.round?.submittedPlayerIds.includes(me.id)} />
      )}
      {snapshot.phase === "SUBMIT" && audience && <WaitingCard text="Players are writing takes. Stay loud." />}
      {snapshot.phase === "REVEAL" && <WaitingCard text="Takes are being revealed on the big screen." />}
      {snapshot.phase === "VOTE" && <VoteCard />}
      {snapshot.phase === "SCORE" && <ScoreCard />}
      {snapshot.phase === "MATCH_END" && <EndCard />}
      <div aria-live="polite" className="mt-auto text-center text-xs text-mist/40">
        {me ? (me.connected ? "Connected" : "Reconnecting…") : "Session restored"}
      </div>
    </main>
  );
}

function Header({
  audience,
  displayName,
  code,
}: {
  audience: boolean;
  displayName: string;
  code: string;
}) {
  return (
    <header className="flex items-center justify-between">
      <div>
        <div className="text-xs uppercase tracking-widest text-mist/60">{audience ? "Audience" : "Player"}</div>
        <div className="text-lg font-semibold">{displayName}</div>
      </div>
      <div className="text-right">
        <div className="text-xs uppercase tracking-widest text-mist/60">Room</div>
        <div className="font-mono text-lg tracking-[0.35em] text-neon">{code}</div>
      </div>
    </header>
  );
}

function LobbyCard({ audience }: { audience: boolean }) {
  return (
    <div className="cc-card p-5">
      <h2 className="text-xl font-semibold">You&apos;re in.</h2>
      <p className="mt-1 text-sm text-mist/70">
        {audience
          ? "You're in audience mode — you'll vote but won't submit takes."
          : "The host will start the match. Loosen your thumbs."}
      </p>
    </div>
  );
}

function SubmitCard({ submitted }: { submitted: boolean }) {
  const { snapshot } = useRoomStore();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const round = snapshot?.round;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    getSocket().emit("player:submit", { text }, (res) => {
      setBusy(false);
      if (!res.ok) setError(res.reason);
    });
  }

  if (!round) return null;

  return (
    <div className="cc-card p-5">
      <div className="flex items-center justify-between text-xs text-mist/60">
        <span>Round {round.number} of {round.total}</span>
        <Countdown endsAt={round.phaseEndsAt} />
      </div>
      <h2 className="mt-2 text-lg font-semibold leading-snug">{round.prompt}</h2>
      {submitted ? (
        <div className="mt-4 rounded-xl bg-neon/15 p-4 text-neon">
          Take submitted. You can tweak it until time runs out.
        </div>
      ) : null}
      <form onSubmit={submit} className="mt-4">
        <label htmlFor="take" className="sr-only">
          Your take
        </label>
        <textarea
          id="take"
          className="cc-input min-h-[120px] text-base"
          placeholder="Type your take…"
          maxLength={140}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="mt-1 text-right text-xs text-mist/50 tabular-nums">{text.length}/140</div>
        {error && (
          <div role="alert" className="mt-2 text-sm text-ember">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={busy || text.trim().length === 0}
          className="cc-btn-primary mt-3 w-full"
        >
          {submitted ? "Update take" : "Submit take"}
        </button>
      </form>
    </div>
  );
}

function WaitingCard({ text }: { text: string }) {
  return (
    <div className="cc-card p-6 text-center">
      <div className="mx-auto mb-3 h-2 w-2 animate-pulseSoft rounded-full bg-neon" />
      <p className="text-sm text-mist/80">{text}</p>
    </div>
  );
}

function VoteCard() {
  const { snapshot, session } = useRoomStore();
  const round = snapshot?.round;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const myId = session?.playerId;
  const alreadyVoted = useMemo(
    () => (myId && round ? round.votedVoterIds.includes(myId) : false),
    [round, myId]
  );

  function vote(submissionId: string, ownSubmission: boolean) {
    if (ownSubmission) {
      setError("You can't vote for your own take.");
      return;
    }
    setBusy(true);
    setError(null);
    getSocket().emit("player:vote", { submissionId }, (res) => {
      setBusy(false);
      if (!res.ok) setError(res.reason);
    });
  }

  if (!round) return null;
  return (
    <div className="cc-card p-5">
      <div className="flex items-center justify-between text-xs text-mist/60">
        <span>Vote for the {round.criterionLabel}</span>
        <Countdown endsAt={round.phaseEndsAt} />
      </div>
      <h3 className="mt-2 text-base font-semibold text-mist/80">{round.prompt}</h3>
      <div className="mt-4 space-y-2">
        {round.reveal.map((item, i) => {
          const mine = item.authorId === myId;
          return (
            <button
              key={item.submissionId}
              disabled={busy || alreadyVoted || mine}
              onClick={() => vote(item.submissionId, mine)}
              className={`w-full rounded-xl border p-4 text-left transition ${
                mine
                  ? "border-white/5 bg-white/5 text-mist/50"
                  : "border-white/10 bg-white/5 hover:border-neon hover:bg-neon/10"
              }`}
            >
              <div className="text-xs text-mist/50">Take {i + 1}{mine ? " (yours)" : ""}</div>
              <div className="mt-1 text-base">{item.text}</div>
            </button>
          );
        })}
      </div>
      {alreadyVoted && <div className="mt-3 text-sm text-neon">Vote locked in. Nice.</div>}
      {error && (
        <div role="alert" className="mt-2 text-sm text-ember">
          {error}
        </div>
      )}
    </div>
  );
}

function ScoreCard() {
  const { snapshot } = useRoomStore();
  if (!snapshot) return null;
  const leaderboard = [...snapshot.players].sort((a, b) => b.score - a.score);
  return (
    <div className="cc-card p-5">
      <h3 className="text-base font-semibold">Scores so far</h3>
      <ul className="mt-2 space-y-1 text-sm">
        {leaderboard.map((p, i) => (
          <li key={p.id} className="flex justify-between rounded bg-white/5 p-2">
            <span>
              {i + 1}. {p.displayName}
            </span>
            <span className="font-mono">{p.score}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EndCard() {
  const { snapshot } = useRoomStore();
  if (!snapshot) return null;
  const leaderboard = [...snapshot.players].sort((a, b) => b.score - a.score);
  const champ = leaderboard[0];
  return (
    <div className="cc-card p-6 text-center">
      <h3 className="text-lg font-semibold">
        {champ ? `${champ.displayName} wins!` : "Match complete"}
      </h3>
      <p className="mt-1 text-sm text-mist/70">Back to the lobby momentarily.</p>
    </div>
  );
}

function Loader() {
  return (
    <main className="grid min-h-[100dvh] place-items-center px-6">
      <div className="cc-chip">
        <span className="h-1.5 w-1.5 animate-pulseSoft rounded-full bg-neon" />
        Reconnecting to room…
      </div>
    </main>
  );
}
