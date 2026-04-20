"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRoomStore } from "@/stores/useRoomStore";
import { getSocket } from "@/lib/socketClient";
import { Countdown } from "./Countdown";
import type { GameCard } from "@/lib/types";
import { Canvas } from "./Canvas";
import { DrawingView, tryParseDrawing } from "./DrawingView";
import { emptyDrawing, isDrawingNonTrivial, type Drawing } from "@/lib/drawing";

export function PlayerView() {
  const { snapshot, session } = useRoomStore();
  if (!snapshot || !session) return <Loader />;
  const me = snapshot.players.find((p) => p.id === session.playerId);
  const audience = session.isAudience;
  const game = snapshot.games.find(
    (g) =>
      g.id === (snapshot.round?.gameId ?? snapshot.currentGameId ?? snapshot.selectedGameId)
  );

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col gap-4 px-4 py-6">
      <Header
        audience={audience}
        displayName={session.displayName}
        code={snapshot.code}
        gameName={game?.name ?? null}
      />
      {snapshot.phase === "LOBBY" && <LobbyCard audience={audience} game={game ?? null} />}
      {snapshot.phase === "SUBMIT" && !audience && (
        <SubmitCard
          submitted={!!me && !!snapshot.round?.submittedPlayerIds.includes(me.id)}
          game={game ?? null}
        />
      )}
      {snapshot.phase === "SUBMIT" && audience && (
        <WaitingCard text="Players are writing answers. Stay loud." />
      )}
      {snapshot.phase === "REVEAL" && (
        <WaitingCard text="Answers are being revealed on the big screen." />
      )}
      {snapshot.phase === "VOTE" && game?.flow === "standard" && (
        <VoteCard game={game} />
      )}
      {snapshot.phase === "VOTE" && game?.flow !== "standard" && (
        <WaitingCard text="Scores are coming up on the big screen." />
      )}
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
  gameName,
}: {
  audience: boolean;
  displayName: string;
  code: string;
  gameName: string | null;
}) {
  return (
    <header className="flex items-center justify-between">
      <div>
        <div className="text-xs uppercase tracking-widest text-mist/60">
          {audience ? "Audience" : "Player"}
          {gameName ? ` • ${gameName}` : ""}
        </div>
        <div className="text-lg font-semibold">{displayName}</div>
      </div>
      <div className="text-right">
        <div className="text-xs uppercase tracking-widest text-mist/60">Room</div>
        <div className="font-mono text-lg tracking-[0.35em] text-neon">{code}</div>
      </div>
    </header>
  );
}

function LobbyCard({ audience, game }: { audience: boolean; game: GameCard | null }) {
  return (
    <div className="cc-card p-5">
      <h2 className="text-xl font-semibold">You&apos;re in.</h2>
      {game && (
        <div className="mt-2 rounded-xl bg-white/5 p-3 text-sm">
          <div className="text-xs uppercase tracking-widest text-mist/60">Next up</div>
          <div className="mt-1 font-semibold">{game.name}</div>
          <div className="text-mist/70">{game.tagline}</div>
        </div>
      )}
      <p className="mt-3 text-sm text-mist/70">
        {audience
          ? "You're in audience mode — you'll vote but won't submit."
          : "The host will start the match. Loosen your thumbs."}
      </p>
    </div>
  );
}

function SubmitCard({
  submitted,
  game,
}: {
  submitted: boolean;
  game: GameCard | null;
}) {
  const { snapshot } = useRoomStore();
  const round = snapshot?.round;
  if (!round || !game) return null;

  const kind = round.submissionKind;
  if (kind === "DRAWING") return <DrawingSubmit submitted={submitted} game={game} />;
  if (kind === "QUIZ") return <QuizSubmit submitted={submitted} game={game} />;
  if (kind === "TAP") return <TapSubmit submitted={submitted} game={game} />;
  return <TextSubmit submitted={submitted} game={game} />;
}

interface RoundHeaderData {
  number: number;
  total: number;
  prompt: string | null;
  promptDetail: string | null;
  phaseEndsAt: number | null;
}

function SubmitHeader({
  game,
  round,
  children,
}: {
  game: GameCard;
  round: RoundHeaderData;
  children?: React.ReactNode;
}) {
  return (
    <>
      <div className="flex items-center justify-between text-xs text-mist/60">
        <span>
          {game.name} • Round {round.number}/{round.total}
        </span>
        <Countdown endsAt={round.phaseEndsAt} />
      </div>
      <h2 className="mt-2 text-lg font-semibold leading-snug">{round.prompt}</h2>
      {round.promptDetail && (
        <div className="mt-1 text-sm text-mist/60">{round.promptDetail}</div>
      )}
      {children}
    </>
  );
}

function TextSubmit({ submitted, game }: { submitted: boolean; game: GameCard }) {
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
  const placeholder = placeholderForGame(game.id);
  const label = labelForGame(game.id);

  return (
    <div className="cc-card p-5">
      <SubmitHeader game={game} round={round} />
      {submitted ? (
        <div className="mt-4 rounded-xl bg-neon/15 p-4 text-neon">
          Locked in. You can tweak it until time runs out.
        </div>
      ) : null}
      <form onSubmit={submit} className="mt-4">
        <label htmlFor="take" className="sr-only">
          {label}
        </label>
        <textarea
          id="take"
          className="cc-input min-h-[120px] text-base"
          placeholder={placeholder}
          maxLength={140}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="mt-1 text-right text-xs text-mist/50 tabular-nums">
          {text.length}/140
        </div>
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
          {submitted ? "Update answer" : "Submit answer"}
        </button>
      </form>
    </div>
  );
}

function DrawingSubmit({ submitted, game }: { submitted: boolean; game: GameCard }) {
  const { snapshot } = useRoomStore();
  const [drawing, setDrawing] = useState<Drawing>(() => emptyDrawing());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const round = snapshot?.round;

  function submit() {
    if (busy) return;
    if (!isDrawingNonTrivial(drawing)) {
      setError("Add a few more strokes first!");
      return;
    }
    setBusy(true);
    setError(null);
    getSocket().emit(
      "player:submit",
      { text: JSON.stringify(drawing) },
      (res) => {
        setBusy(false);
        if (!res.ok) setError(res.reason);
      }
    );
  }

  if (!round) return null;
  return (
    <div className="cc-card p-4">
      <SubmitHeader game={game} round={round} />
      <div className="mt-3">
        <Canvas value={drawing} onChange={setDrawing} />
      </div>
      {submitted && (
        <div className="mt-3 rounded-xl bg-neon/15 p-3 text-sm text-neon">
          Drawing locked in. You can update it until time runs out.
        </div>
      )}
      {error && (
        <div role="alert" className="mt-2 text-sm text-ember">
          {error}
        </div>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="cc-btn-primary mt-3 w-full"
      >
        {submitted ? "Update drawing" : "Submit drawing"}
      </button>
    </div>
  );
}

function QuizSubmit({ submitted, game }: { submitted: boolean; game: GameCard }) {
  const { snapshot } = useRoomStore();
  const round = snapshot?.round;
  const [choice, setChoice] = useState<string | null>(null);
  const [wager, setWager] = useState(300);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function submit() {
    if (busy) return;
    if (!choice) {
      setError("Pick one of the choices first.");
      return;
    }
    setBusy(true);
    setError(null);
    getSocket().emit(
      "player:submit",
      { text: JSON.stringify({ choice, wager }) },
      (res) => {
        setBusy(false);
        if (!res.ok) setError(res.reason);
      }
    );
  }

  if (!round) return null;
  const choices = round.choices ?? [];
  return (
    <div className="cc-card p-5">
      <SubmitHeader game={game} round={round} />
      <div className="mt-4 grid gap-2">
        {choices.map((c) => {
          const active = choice === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setChoice(c)}
              className={`rounded-xl border p-3 text-left transition ${
                active
                  ? "border-sol bg-sol/15 text-sol"
                  : "border-white/10 bg-white/5 hover:border-white/30"
              }`}
            >
              {c}
            </button>
          );
        })}
      </div>
      <div className="mt-5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-mist/70">Wager</span>
          <span className="font-mono text-sol">{wager}</span>
        </div>
        <input
          type="range"
          min={100}
          max={1000}
          step={50}
          value={wager}
          onChange={(e) => setWager(Number(e.target.value))}
          className="mt-2 w-full accent-sol"
          aria-label="Wager"
        />
        <div className="mt-1 flex justify-between text-xs text-mist/40">
          <span>100</span>
          <span>1000</span>
        </div>
      </div>
      {submitted && (
        <div className="mt-3 rounded-xl bg-neon/15 p-3 text-sm text-neon">
          Locked in. You can change it until time runs out.
        </div>
      )}
      {error && (
        <div role="alert" className="mt-2 text-sm text-ember">
          {error}
        </div>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={busy || !choice}
        className="cc-btn-primary mt-4 w-full"
      >
        {submitted ? "Update answer" : `Lock in ${wager} on "${choice ?? "…"}"`}
      </button>
    </div>
  );
}

// Tap Rally — client-driven real-time reaction mini-game.
// Targets spawn at random positions, each living ~1.2s. Tap before it expires
// to bank points (faster tap = more). At phase end, final score is submitted.
interface TapTarget {
  id: number;
  x: number; // 0..1 normalized
  y: number; // 0..1 normalized
  r: number; // pixel radius
  spawnedAt: number;
  lifetime: number;
  alive: boolean;
}

function TapSubmit({ submitted, game }: { submitted: boolean; game: GameCard }) {
  const { snapshot } = useRoomStore();
  const round = snapshot?.round;
  const [score, setScore] = useState(0);
  const [hits, setHits] = useState(0);
  const [missesCount, setMissesCount] = useState(0);
  const [fastestMs, setFastestMs] = useState<number>(9999);
  const [targets, setTargets] = useState<TapTarget[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittedOnce, setSubmittedOnce] = useState(false);
  const startRef = useRef<number>(Date.now());
  const nextIdRef = useRef(1);

  // Restart when a new round begins.
  useEffect(() => {
    startRef.current = Date.now();
    setScore(0);
    setHits(0);
    setMissesCount(0);
    setFastestMs(9999);
    setTargets([]);
    setSubmittedOnce(false);
    nextIdRef.current = 1;
  }, [round?.number, round?.gameId]);

  const endsAt = round?.phaseEndsAt ?? null;
  const active = endsAt != null && Date.now() < endsAt;

  // Spawn loop — every ~450ms add a target.
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      setTargets((cur) => {
        const now = Date.now();
        // Drop any that expired (counts as a miss).
        const kept: TapTarget[] = [];
        let expired = 0;
        for (const t of cur) {
          if (!t.alive) continue;
          if (now - t.spawnedAt >= t.lifetime) {
            expired++;
            continue;
          }
          kept.push(t);
        }
        if (expired) setMissesCount((m) => m + expired);
        // Cap concurrent targets so the board doesn't get unfair.
        if (kept.length >= 4) return kept;
        const fresh: TapTarget = {
          id: nextIdRef.current++,
          x: 0.1 + Math.random() * 0.8,
          y: 0.1 + Math.random() * 0.8,
          r: 36 + Math.floor(Math.random() * 18),
          spawnedAt: now,
          lifetime: 1100 + Math.random() * 700,
          alive: true,
        };
        return [...kept, fresh];
      });
    }, 440);
    return () => clearInterval(interval);
  }, [active]);

  // GC expired targets at ~30fps so the UI stays smooth.
  useEffect(() => {
    if (!active) return;
    const tick = setInterval(() => {
      setTargets((cur) => {
        const now = Date.now();
        let expired = 0;
        const kept: TapTarget[] = [];
        for (const t of cur) {
          if (!t.alive) continue;
          if (now - t.spawnedAt >= t.lifetime) {
            expired++;
            continue;
          }
          kept.push(t);
        }
        if (expired) setMissesCount((m) => m + expired);
        return kept;
      });
    }, 33);
    return () => clearInterval(tick);
  }, [active]);

  const handleHit = useCallback((id: number) => {
    setTargets((cur) => {
      const t = cur.find((x) => x.id === id);
      if (!t || !t.alive) return cur;
      const age = Date.now() - t.spawnedAt;
      // Faster tap → more points (max ~15, min ~5).
      const bonus = Math.max(5, Math.round(15 - (age / t.lifetime) * 10));
      setScore((s) => s + bonus);
      setHits((h) => h + 1);
      setFastestMs((m) => Math.min(m, age));
      return cur.filter((x) => x.id !== id);
    });
  }, []);

  // Auto-submit when the phase timer elapses.
  useEffect(() => {
    if (!endsAt) return;
    const msLeft = endsAt - Date.now();
    if (msLeft <= 0) return;
    const t = setTimeout(() => {
      doSubmit();
    }, msLeft + 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt]);

  function doSubmit() {
    if (submitting || submittedOnce) return;
    setSubmitting(true);
    setError(null);
    getSocket().emit(
      "player:submit",
      {
        text: JSON.stringify({
          score,
          hits,
          misses: missesCount,
          fastestMs: fastestMs === 9999 ? 0 : fastestMs,
        }),
      },
      (res) => {
        setSubmitting(false);
        if (!res.ok) setError(res.reason);
        else setSubmittedOnce(true);
      }
    );
  }

  if (!round) return null;
  return (
    <div className="cc-card p-4">
      <SubmitHeader game={game} round={round} />
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="cc-chip !bg-ember/15 !text-ember">Score {score}</span>
        <span className="cc-chip">Hits {hits}</span>
        <span className="cc-chip">Miss {missesCount}</span>
      </div>
      <div
        className="relative mt-3 aspect-square w-full overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-ember/10 via-black to-sol/10"
        role="region"
        aria-label="Tap the targets"
      >
        {active
          ? targets.map((t) => {
              const elapsed = Date.now() - t.spawnedAt;
              const frac = Math.max(0, 1 - elapsed / t.lifetime);
              return (
                <button
                  key={t.id}
                  type="button"
                  onPointerDown={() => handleHit(t.id)}
                  aria-label="Tap target"
                  className="absolute grid place-items-center rounded-full bg-ember/90 shadow-[0_0_20px_rgba(255,79,123,0.8)] transition-transform active:scale-90"
                  style={{
                    left: `calc(${t.x * 100}% - ${t.r}px)`,
                    top: `calc(${t.y * 100}% - ${t.r}px)`,
                    width: t.r * 2,
                    height: t.r * 2,
                    opacity: 0.3 + 0.7 * frac,
                  }}
                >
                  <span className="text-xs font-bold text-white">TAP</span>
                </button>
              );
            })
          : (
              <div className="absolute inset-0 grid place-items-center text-mist/60">
                {submittedOnce || submitted
                  ? "Score banked. Nice work."
                  : "Get ready…"}
              </div>
            )}
      </div>
      {error && (
        <div role="alert" className="mt-2 text-sm text-ember">
          {error}
        </div>
      )}
      {active && (
        <button
          type="button"
          onClick={doSubmit}
          disabled={submitting}
          className="cc-btn-ghost mt-3 w-full text-sm"
        >
          Bank score now
        </button>
      )}
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

function VoteCard({ game }: { game: GameCard | null }) {
  const { snapshot, session } = useRoomStore();
  const round = snapshot?.round;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const myId = session?.playerId;
  const alreadyVoted = useMemo(
    () => (myId && round ? round.votedVoterIds.includes(myId) : false),
    [round, myId]
  );
  const isFib = game?.scoring === "fib";

  function vote(submissionId: string | null, ownSubmission: boolean) {
    if (ownSubmission) {
      setError("You can't vote for your own answer.");
      return;
    }
    setBusy(true);
    setError(null);
    getSocket().emit(
      "player:vote",
      { submissionId: submissionId ?? "__truth__" },
      (res) => {
        setBusy(false);
        if (!res.ok) setError(res.reason);
      }
    );
  }

  if (!round || !game) return null;
  return (
    <div className="cc-card p-5">
      <div className="flex items-center justify-between text-xs text-mist/60">
        <span>
          {isFib
            ? "Pick the real answer"
            : round.criterionLabel
            ? `Vote for the ${round.criterionLabel.toLowerCase()}`
            : "Vote"}
        </span>
        <Countdown endsAt={round.phaseEndsAt} />
      </div>
      <h3 className="mt-2 text-base font-semibold text-mist/80">{round.prompt}</h3>
      <div className="mt-4 grid gap-2">
        {round.reveal.map((item, i) => {
          const mine = item.authorId && item.authorId === myId;
          const isDrawing = round.submissionKind === "DRAWING" && !item.isTruth;
          const drawing = isDrawing ? tryParseDrawing(item.text) : null;
          return (
            <button
              key={item.submissionId ?? `truth-${i}`}
              disabled={busy || alreadyVoted || !!mine}
              onClick={() => vote(item.submissionId, !!mine)}
              className={`w-full rounded-xl border p-3 text-left transition ${
                mine
                  ? "border-white/5 bg-white/5 text-mist/50"
                  : "border-white/10 bg-white/5 hover:border-neon hover:bg-neon/10"
              }`}
            >
              <div className="text-xs text-mist/50">
                {isFib ? `Answer ${i + 1}` : `Entry ${i + 1}`}
                {mine ? " (yours)" : ""}
              </div>
              {drawing ? (
                <div className="mt-2">
                  <DrawingView drawing={drawing} />
                </div>
              ) : (
                <div className="mt-1 text-base">{item.text}</div>
              )}
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

function placeholderForGame(gameId: string): string {
  const map: Record<string, string> = {
    "hot-take-hustle": "Drop your take…",
    "pitch-party": "Your one-sentence pitch…",
    "bad-advice-booth": "The worst possible advice…",
    "hype-machine": "Hype it up…",
    "scene-stealer": "The line that steals the scene…",
    "crowd-fibs": "Your fake answer (make it sound true)…",
    "caption-chaos": "Your caption…",
    "villain-origin": "The villain origin story…",
    "fortune-forge": "Your fortune…",
    "red-flag-rally": "Flip the flag…",
  };
  return map[gameId] ?? "Type your answer…";
}

function labelForGame(gameId: string): string {
  const map: Record<string, string> = {
    "hot-take-hustle": "Your take",
    "pitch-party": "Your pitch",
    "bad-advice-booth": "Your advice",
    "hype-machine": "Your hype",
    "scene-stealer": "Your line",
    "crowd-fibs": "Your fake answer",
    "caption-chaos": "Your caption",
    "villain-origin": "Your origin",
    "fortune-forge": "Your fortune",
    "red-flag-rally": "Your flip",
  };
  return map[gameId] ?? "Your answer";
}
